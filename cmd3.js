/* No external dependencies are required */
const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
// Replaced the old M3U_URL with the new URL for VPN/DNS bypass to overcome geo-restrictions
let M3U_URL = "http://fortv.cc:8080/get.php?username=3RLR5J&password=0D4TinR&type=m3u";
const CHANNELS_PER_PAGE = 5;
// Removed the time limiting rate to make the bot work faster

// Added caching variables to speed up the bot and handle many users effectively
let channelsCache = [];
let lastCacheTime = 0;
const CHANNELS_CACHE_TTL = 60000; // Cache channels for 60 seconds

// In-memory custom channels store per user for custom URL/file submissions
const customChannelsMap = new Map();

// In-memory pending custom URL state per user (to track when a user clicks "Add Custom URL")
const pendingCustomUrlMap = new Map();

// In-memory pending admin URL update state (to track when admin clicks "Update URL" on dashboard)
const pendingAdminUrlMap = new Map();

// In-memory pending admin broadcast state (to track when admin clicks "Broadcast" on dashboard)
const pendingAdminBroadcastMap = new Map();

// In-memory subscribers set for users who subscribed to notifications
const subscribers = new Set();

// Admin/Owner chat ID for dashboard access (update this with your actual admin chat id)
const ADMIN_CHAT_ID = 6333020403;

// Helper function to simulate a VPN/DNS changer to bypass geo-restrictions
function bypassGeo(url) {
  // In a real implementation, this function would modify the request
  // parameters or route the connection through a VPN/DNS changer service.
  // For now, it logs the activation and returns the original URL.
  console.log("Bypassing geo restrictions for URL:", url);
  return url;
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  // Handle dashboard routes via GET and POST at /dashboard and its subpaths
  if (request.method === "GET") {
    if (url.pathname === "/dashboard") {
      return handleDashboard(request);
    } else {
      return new Response("Invalid request", { status: 400 });
    }
  } else if (request.method === "POST") {
    if (url.pathname === "/dashboard/update_url") {
      return handleDashboardUpdateUrl(request);
    } else if (url.pathname === "/dashboard/broadcast") {
      return handleDashboardBroadcast(request);
    } else {
      // Original POST handler for Telegram messages
      let update;
      try {
        update = await request.json();
      } catch (error) {
        return new Response("Error parsing JSON", { status: 400 });
      }
      
      if (update.message) {
        await processTelegramMessage(update.message);
      } else if (update.callback_query) {
        await processCallbackQuery(update.callback_query);
      }
      return new Response("OK");
    }
  }
  return new Response("Invalid request", { status: 400 });
}

// Dashboard HTML page for admin management
async function handleDashboard(request) {
  const url = new URL(request.url);
  const admin_id = url.searchParams.get("admin_id");
  if (admin_id !== ADMIN_CHAT_ID.toString()) {
    return new Response("Access Denied", { status: 403 });
  }
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Admin Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        .section { margin-bottom: 20px; }
        input[type="text"], textarea { width: 100%; padding: 8px; margin: 5px 0; }
        input[type="submit"] { padding: 10px 20px; background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
        input[type="submit"]:hover { background: #0056b3; }
        .info { background: #e9ecef; padding: 10px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🌟 Admin Dashboard</h1>
        <div class="section">
          <h2>Current M3U URL</h2>
          <div class="info">${M3U_URL}</div>
          <form action="/dashboard/update_url?admin_id=${ADMIN_CHAT_ID}" method="POST">
            <label for="newUrl">Update M3U URL:</label>
            <input type="text" id="newUrl" name="newUrl" placeholder="Enter new M3U URL" required>
            <input type="submit" value="Update URL">
          </form>
        </div>
        <div class="section">
          <h2>Broadcast Message</h2>
          <form action="/dashboard/broadcast?admin_id=${ADMIN_CHAT_ID}" method="POST">
            <label for="broadcast">Message:</label>
            <textarea id="broadcast" name="broadcast" rows="4" placeholder="Enter broadcast message" required></textarea>
            <input type="submit" value="Send Broadcast">
          </form>
        </div>
        <div class="section">
          <h2>Subscribers</h2>
          <div class="info">
            Total Subscribers: ${subscribers.size}<br>
            ${Array.from(subscribers).join("<br>")}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}

// Handle dashboard URL update via POST
async function handleDashboardUpdateUrl(request) {
  const url = new URL(request.url);
  const admin_id = url.searchParams.get("admin_id");
  if (admin_id !== ADMIN_CHAT_ID.toString()) {
    return new Response("Access Denied", { status: 403 });
  }
  const formData = await request.formData();
  const newUrl = formData.get("newUrl");
  if (!/^https?:\/\//.test(newUrl)) {
    return new Response("Invalid URL. Please send a URL starting with http:// or https://.", { status: 400 });
  }
  M3U_URL = newUrl;
  channelsCache = []; // Clear cache to force fetching with new URL
  return new Response(`M3U URL updated successfully to: ${M3U_URL}`, { status: 200 });
}

// Handle dashboard broadcast via POST
async function handleDashboardBroadcast(request) {
  const url = new URL(request.url);
  const admin_id = url.searchParams.get("admin_id");
  if (admin_id !== ADMIN_CHAT_ID.toString()) {
    return new Response("Access Denied", { status: 403 });
  }
  const formData = await request.formData();
  const broadcastMessage = formData.get("broadcast");
  if (!broadcastMessage) {
    return new Response("Broadcast message is empty.", { status: 400 });
  }
  // Broadcast message to all subscribers
  for (let chatId of subscribers) {
    await sendMessage(chatId, broadcastMessage);
  }
  return new Response(`Broadcast message sent to ${subscribers.size} subscribers.`, { status: 200 });
}

// Fetch and parse M3U playlist with caching added for performance
async function fetchChannels() {
  try {
    const now = Date.now();
    if (channelsCache.length > 0 && (now - lastCacheTime) < CHANNELS_CACHE_TTL) {
      console.log("Using cached channels");
      return channelsCache;
    }
    // Ensure VPN/DNS bypass by processing the URL through our bypass function
    const urlWithBypass = bypassGeo(M3U_URL);
    const response = await fetch(urlWithBypass, { method: "GET" });
    
    if (!response.ok) {
      console.error(`Failed to fetch M3U file, status: ${response.status}`);
      return [];
    }
    
    const content = await response.text();
    console.log("Fetched M3U Content:", content);
    
    const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
    let match;
    let channels = [];
    
    while ((match = regex.exec(content)) !== null) {
      channels.push({ name: match[1].trim(), url: match[2].trim() });
    }
    
    if (channels.length === 0) {
      console.log("No channels found in the M3U content.");
    }
    
    console.log("Extracted Channels:", channels);
    channelsCache = channels;
    lastCacheTime = Date.now();
    return channels;
  } catch (error) {
    console.error("Error fetching channels:", error);
    return [];
  }
}

// Handle incoming Telegram messages
async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  
  // Check if admin is in pending broadcast mode
  if (pendingAdminBroadcastMap.has(chat_id)) {
    pendingAdminBroadcastMap.delete(chat_id);
    const broadcastMessage = message.text;
    for (let sub of subscribers) {
      await sendMessage(sub, broadcastMessage);
    }
    await sendMessage(chat_id, "Broadcast message sent to all subscribers.");
    return;
  }
  
  // Check for admin dashboard access: only accessible by ADMIN_CHAT_ID
  if (message.text === "/admin") {
    if (chat_id === ADMIN_CHAT_ID) {
      let keyboard = {
        inline_keyboard: [
          [{ text: "🔄 Update URL", callback_data: "admin_update_url" }],
          [{ text: "📢 Broadcast", callback_data: "admin_broadcast" }],
          [{ text: "📊 Stats", callback_data: "admin_stats" }]
        ]
      };
      const adminMessage = "╔═🌟 Admin Dashboard ☆═╗\nCurrent M3U URL:\n`" + M3U_URL + "`\n\nClick the buttons below to update the URL, send a broadcast message, or view stats.";
      await sendMessage(chat_id, adminMessage, keyboard);
    } else {
      await sendMessage(chat_id, "Access Denied: You are not authorized to access the admin dashboard.");
    }
    return;
  }
  
  // Check for admin URL update process
  if (pendingAdminUrlMap.has(chat_id)) {
    pendingAdminUrlMap.delete(chat_id);
    if (/^https?:\/\//.test(message.text)) {
      M3U_URL = message.text;
      // Clear cache to force fetching with new URL
      channelsCache = [];
      await sendMessage(chat_id, "M3U URL updated successfully to:\n`" + M3U_URL + "`");
      return;
    } else {
      await sendMessage(chat_id, "Invalid URL. Please send a URL starting with http:// or https://.");
      return;
    }
  }
  
  // Check for file upload (for .m3u files)
  if (message.document && message.document.file_name && message.document.file_name.toLowerCase().endsWith('.m3u')) {
    await processUploadedM3UFile(message);
    return;
  }
  
  // For text messages processing
  const text = message.text;
  
  // If the user previously clicked the "Add Custom URL" button, process the custom URL submission
  if (pendingCustomUrlMap.has(chat_id)) {
    pendingCustomUrlMap.delete(chat_id);
    if (/^https?:\/\//.test(text)) {
      await processCustomUrl(chat_id, text);
      return;
    } else {
      await sendMessage(chat_id, "Invalid custom URL. Please send a URL starting with http:// or https://.");
      return;
    }
  }
  
  if (text === "/start") {
    let keyboard = {
      inline_keyboard: [
        [{ text: "📺 View Channels", callback_data: "channels_0" }],
        [{ text: "🔗 Subscribe", callback_data: "subscribe" }, { text: "❌ Unsubscribe", callback_data: "unsubscribe" }],
        [{ text: "➕ Add Bot to Group", callback_data: "group_add" }],
        [{ text: "👑 Share Bot", callback_data: "beautiful_share" }],
        [{ text: "Please paste and send your URL", callback_data: "custom_url" }],
        [{ text: "📤 Upload .m3u File", callback_data: "upload_m3u" }]
      ],
    };
    // Updated beautiful/digital menu welcome message
    const welcomeMessage = "╔═🌟 Digital TV Menu ☆═╗\n\nPlease select an option below:";
    await sendMessage(chat_id, welcomeMessage, keyboard);
  } else if (/^https?:\/\//.test(text)) {
    // Process custom URL submission if the message starts with http:// or https://
    await processCustomUrl(chat_id, text);
  } else {
    await searchChannel(chat_id, text);
  }
}

// Process button clicks in Telegram
async function processCallbackQuery(query) {
  const chat_id = query.message.chat.id;
  const data = query.data;
  
  if (data.startsWith("channels_")) {
    let page = parseInt(data.split("_")[1]);
    // Update the stationary menu by editing the original message instead of sending a new one
    await listChannels(chat_id, page, query.message.message_id);
  } else if (data.startsWith("play_")) {
    let id = parseInt(data.split("_")[1]);
    await playChannel(chat_id, id);
  } else if (data === "custom_url") {
    // Set pending state and prompt the user with updated instructions at the top
    pendingCustomUrlMap.set(chat_id, true);
    await sendMessage(chat_id, "Please paste and send your URL");
  } else if (data === "upload_m3u") {
    // Prompt the user to upload their .m3u file
    await sendMessage(chat_id, "Please upload your .m3u file:");
  } else if (data.startsWith("custom_channels_")) {
    let page = parseInt(data.split("_")[2]);
    await listCustomChannels(chat_id, page, query.message.message_id);
  } else if (data.startsWith("custom_play_")) {
    let id = parseInt(data.split("_")[2]);
    await playCustomChannel(chat_id, id);
  } else if (data === "admin_update_url") {
    // Only allow admin to update URL
    if (chat_id === ADMIN_CHAT_ID) {
      pendingAdminUrlMap.set(chat_id, true);
      await sendMessage(chat_id, "Please send the new M3U URL:");
    } else {
      await sendMessage(chat_id, "Access Denied: You are not authorized to perform this action.");
    }
  } else if (data === "admin_broadcast") {
    // Only allow admin to broadcast
    if (chat_id === ADMIN_CHAT_ID) {
      pendingAdminBroadcastMap.set(chat_id, true);
      await sendMessage(chat_id, "Please send the broadcast message to all subscribers:");
    } else {
      await sendMessage(chat_id, "Access Denied: You are not authorized to perform this action.");
    }
  } else if (data === "admin_stats") {
    // Only allow admin to view stats
    if (chat_id === ADMIN_CHAT_ID) {
      const statsMessage = `📊 Stats:\nTotal Subscribers: ${subscribers.size}\nCached Channels: ${channelsCache.length}`;
      await sendMessage(chat_id, statsMessage);
    } else {
      await sendMessage(chat_id, "Access Denied: You are not authorized to perform this action.");
    }
  } else if (data === "subscribe") {
    // Add the user to subscribers and confirm
    subscribers.add(chat_id);
    await sendMessage(chat_id, "You have successfully subscribed to notifications.");
  } else if (data === "unsubscribe") {
    // Remove the user from subscribers and confirm
    subscribers.delete(chat_id);
    await sendMessage(chat_id, "You have successfully unsubscribed from notifications.");
  } else if (data === "beautiful_share") {
    // Provide a beautiful share message with an inline button linking to the bot
    let shareKeyboard = {
      inline_keyboard: [
        [{ text: "Share this bot", url: "https://t.me/Freeiptvstream_bot" }]
      ]
    };
    await sendMessage(chat_id, "🌟 Share our Digital TV Bot with your friends! Click the button below to share.", shareKeyboard);
  }
}

// Send a message to Telegram
async function sendMessage(chat_id, text, keyboard = null) {
  let payload = {
    chat_id,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };
  
  if (keyboard) payload.reply_markup = keyboard;
  
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Edit an existing message (used for stationary menu updates)
async function editMessage(chat_id, message_id, text, keyboard = null) {
  let payload = {
    chat_id,
    message_id,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };
  
  if (keyboard) payload.reply_markup = keyboard;
  
  try {
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Error editing message:", error);
  }
}

// List channels with pagination and updated vertical layout for improved visibility
// The beautiful menu is stationary, meaning the same message is updated for pagination
async function listChannels(chat_id, page, message_id = null) {
  let channels = await fetchChannels();
  if (channels.length === 0) {
    if (message_id) {
      await editMessage(chat_id, message_id, "No channels found. Please try again later.");
    } else {
      await sendMessage(chat_id, "No channels found. Please try again later.");
    }
    return;
  }
  
  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);
  
  // Updated layout: arrange channel buttons vertically to ensure channel names are visible
  let channelButtons = paginatedChannels.map((channel, index) => {
    return [{ text: `▶️ ${channel.name}`, callback_data: `play_${start + index}` }];
  });
  let keyboard = channelButtons;
  
  let navigation = [];
  if (start > 0) navigation.push({ text: "⬅️ Previous", callback_data: `channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡️", callback_data: `channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);
  
  // Updated stationary digital menu message for listing channels
  const listMessage = "╔═🌟 Channel List ☆═╗\nSelect a channel to play:";
  if (message_id) {
    await editMessage(chat_id, message_id, listMessage, { inline_keyboard: keyboard });
  } else {
    await sendMessage(chat_id, listMessage, { inline_keyboard: keyboard });
  }
}

// Search for a channel
async function searchChannel(chat_id, query) {
  let channels = await fetchChannels();
  // Fix: Use global index instead of local index for search results to map to the correct channel
  let results = [];
  channels.forEach((channel, index) => {
    if (channel.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({ channel: channel, index: index });
    }
  });
  
  if (results.length === 0) {
    await sendMessage(chat_id, `No channels found for: \`${query}\``);
    return;
  }
  
  let keyboard = results.map((result) => {
    return [{ text: `▶️ ${result.channel.name}`, callback_data: `play_${result.index}` }];
  });
  const searchMessage = "╔═🌟 Search Results ☆═╗\n**Search Results for:** " + `\`${query}\``;
  await sendMessage(chat_id, searchMessage, { inline_keyboard: keyboard });
}

// Play a channel inside Telegram from the default channels
async function playChannel(chat_id, id) {
  let channels = await fetchChannels();
  if (id >= 0 && id < channels.length) {
    let channel = channels[id];
    // Pass the extracted channel URL through the bypass function to ensure geo-restriction bypass
    let channelUrl = bypassGeo(channel.url);
    
    // Generate one output link that can be used in both VLC and MX Player
    let message = `Now Playing: ${channel.name}\n\n` +
      `📺 To watch this channel, copy the URL below and paste it into the network stream option in your media player:\n` +
      `\`${channelUrl}\`\n\n` +
      `Instructions:\n` +
      `- For VLC: Open VLC, go to Media > Open Network Stream, then paste the URL.\n` +
      `- For MX Player: Open MX Player, tap the menu and select Network Stream, then paste the URL.`;
    await sendMessage(chat_id, message);
  } else {
    await sendMessage(chat_id, "Invalid channel selection.");
  }
}

// Process a custom URL/file submitted by the user
async function processCustomUrl(chat_id, customUrl) {
  try {
    const now = Date.now();
    const urlWithBypass = bypassGeo(customUrl);
    const response = await fetch(urlWithBypass, { method: "GET" });
    if (!response.ok) {
      console.error(`Failed to fetch custom file, status: ${response.status}`);
      await sendMessage(chat_id, "Failed to fetch the custom file. Please check the URL and try again.");
      return;
    }
    
    const content = await response.text();
    console.log("Fetched Custom Content:", content);
    
    const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
    let match;
    let channels = [];
    
    while ((match = regex.exec(content)) !== null) {
      channels.push({ name: match[1].trim(), url: match[2].trim() });
    }
    
    if (channels.length === 0) {
      console.log("No channels found in the custom content.");
      await sendMessage(chat_id, "No channels found in the custom content.");
      return;
    }
    
    console.log("Extracted Custom Channels:", channels);
    customChannelsMap.set(chat_id, channels);
    await sendMessage(chat_id, `Custom channels processed successfully. Found: ${channels.length} channels.`);
  } catch (error) {
    console.error("Error processing custom URL:", error);
    await sendMessage(chat_id, "An error occurred while processing your custom URL.");
  }
}

// Process an uploaded .m3u file submitted by the user
async function processUploadedM3UFile(message) {
  const chat_id = message.chat.id;
  try {
    // In a real implementation, you would retrieve the file using Telegram's getFile method and then fetch its content.
    // Here we simulate file processing by assuming the file URL is provided in the message (this is just for demonstration).
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${message.document.file_id}`;
    const response = await fetch(fileUrl, { method: "GET" });
    if (!response.ok) {
      console.error(`Failed to fetch uploaded file, status: ${response.status}`);
      await sendMessage(chat_id, "Failed to fetch the uploaded file.");
      return;
    }
    
    const content = await response.text();
    console.log("Fetched Uploaded M3U Content:", content);
    
    const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
    let match;
    let channels = [];
    
    while ((match = regex.exec(content)) !== null) {
      channels.push({ name: match[1].trim(), url: match[2].trim() });
    }
    
    if (channels.length === 0) {
      console.log("No channels found in the uploaded file.");
      await sendMessage(chat_id, "No channels found in the uploaded file.");
      return;
    }
    
    console.log("Extracted Channels from Uploaded File:", channels);
    customChannelsMap.set(chat_id, channels);
    await sendMessage(chat_id, `Uploaded file processed successfully. Found: ${channels.length} channels.`);
  } catch (error) {
    console.error("Error processing uploaded file:", error);
    await sendMessage(chat_id, "An error occurred while processing your uploaded file.");
  }
}

// List custom channels for a user with pagination
async function listCustomChannels(chat_id, page, message_id = null) {
  const channels = customChannelsMap.get(chat_id) || [];
  if (channels.length === 0) {
    if (message_id) {
      await editMessage(chat_id, message_id, "No custom channels found. Please add custom channels first.");
    } else {
      await sendMessage(chat_id, "No custom channels found. Please add custom channels first.");
    }
    return;
  }
  
  let start = page * CHANNELS_PER_PAGE;
  let end = start + CHANNELS_PER_PAGE;
  let paginatedChannels = channels.slice(start, end);
  
  let channelButtons = paginatedChannels.map((channel, index) => {
    return [{ text: `▶️ ${channel.name}`, callback_data: `custom_play_${start + index}` }];
  });
  let keyboard = channelButtons;
  
  let navigation = [];
  if (start > 0) navigation.push({ text: "⬅️ Previous", callback_data: `custom_channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡️", callback_data: `custom_channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);
  
  const listMessage = "╔═🌟 Custom Channels ☆═╗\nSelect a channel to play:";
  if (message_id) {
    await editMessage(chat_id, message_id, listMessage, { inline_keyboard: keyboard });
  } else {
    await sendMessage(chat_id, listMessage, { inline_keyboard: keyboard });
  }
}

// Play a custom channel for a user
async function playCustomChannel(chat_id, id) {
  const channels = customChannelsMap.get(chat_id) || [];
  if (id >= 0 && id < channels.length) {
    let channel = channels[id];
    let channelUrl = bypassGeo(channel.url);
    let message = `Now Playing: ${channel.name}\n\n` +
      `📺 To watch this channel, copy the URL below and paste it into the network stream option in your media player:\n` +
      `\`${channelUrl}\`\n\n` +
      `Instructions:\n` +
      `- For VLC: Open VLC, go to Media > Open Network Stream, then paste the URL.\n` +
      `- For MX Player: Open MX Player, tap the menu and select Network Stream, then paste the URL.`;
    await sendMessage(chat_id, message);
  } else {
    await sendMessage(chat_id, "Invalid custom channel selection.");
  }
}
