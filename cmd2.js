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

// In-memory subscribers map for users who subscribed to notifications (stores name & join date)
const subscribers = new Map();
// In-memory unsubscribers map to record users who unsubscribe
const unsubscribers = new Map();

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
    if (url.pathname === "/dashboard/broadcast") {
      return handleDashboardBroadcast(request);
    } else if (url.pathname === "/dashboard/update_url") {
      return handleDashboardUpdateUrl(request);
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
  // Removed the Post URL section per instructions and updated subscriber details display
  let subscribersList = "";
  subscribers.forEach((value, key) => {
    subscribersList += `• ${value.name} (Joined: ${new Date(value.joinDate).toLocaleString()})<br>`;
  });
  let unsubscribersList = "";
  unsubscribers.forEach((value, key) => {
    unsubscribersList += `• ${value.name} (Unsubscribed: ${new Date(value.unsubscribedAt).toLocaleString()})<br>`;
  });
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
            <strong>Active Subscribers [${subscribers.size}]:</strong><br>
            ${subscribersList ? subscribersList : "None"}<br><br>
            <strong>Unsubscribed Users [${unsubscribers.size}]:</strong><br>
            ${unsubscribersList ? unsubscribersList : "None"}
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
  for (let [chatId, subData] of subscribers) {
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
    for (let [subId, subData] of subscribers) {
      await sendMessage(subId, broadcastMessage);
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
        [{ text: "🔗 Subscribe", callback_data: "subscribe" }],
        [{ text: "❌ Unsubscribe", callback_data: "unsubscribe" }],
        [{ text: "📤 Share Bot", callback_data: "share_bot" }],
        [{ text: "➕ Add Bot to Group", callback_data: "group_add" }],
        [{ text: "Please paste and send your URL", callback_data: "custom_url" }],
        [{ text: "📤 Upload .m3u File", callback_data: "upload_m3u" }],
        [{ text: "ℹ️ Commands", callback_data: "commands" }]
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
      const statsMessage = `📊 Stats:\nTotal Active Subscribers: ${subscribers.size}\nCached Channels: ${channelsCache.length}`;
      await sendMessage(chat_id, statsMessage);
    } else {
      await sendMessage(chat_id, "Access Denied: You are not authorized to perform this action.");
    }
  } else if (data === "subscribe") {
    // Add the user to subscribers and confirm (capture name from callback query sender)
    subscribers.set(chat_id, { name: query.from.first_name || ("User " + chat_id), joinDate: Date.now() });
    // If the user was in unsubscribers list, remove them
    if (unsubscribers.has(chat_id)) {
      unsubscribers.delete(chat_id);
    }
    await sendMessage(chat_id, "You have successfully subscribed to notifications.");
  } else if (data === "unsubscribe") {
    // Remove the user from subscribers and add to unsubscribers
    if (subscribers.has(chat_id)) {
      let subscriberData = subscribers.get(chat_id);
      subscribers.delete(chat_id);
      unsubscribers.set(chat_id, { name: subscriberData.name, unsubscribedAt: Date.now() });
      await sendMessage(chat_id, "You have successfully unsubscribed from notifications.");
    } else {
      await sendMessage(chat_id, "You are not subscribed.");
    }
  } else if (data === "share_bot") {
    // Provide a popup shareable link message at the top of the bot using answerCallbackQuery
    await answerCallbackQuery(query.id, "🔗 Share this bot with your friends: https://t.me/Freeiptvstream_bot", true);
  } else if (data === "group_add") {
    // Provide instructions for adding the bot to a group/chat
    await sendMessage(chat_id, "To add the bot to a group, open your Telegram group settings and add the bot as a member.");
  } else if (data === "commands") {
    // Provide a side menu listing all available commands for the bot
    const commandsMessage = "Available Commands:\n/start - Show main menu\n/admin - Admin dashboard\n/subscribe - Subscribe to notifications\n/unsubscribe - Unsubscribe from notifications\nCustom URL: Send a URL starting with http:// or https://\nUpload .m3u File: Upload a file with .m3u extension";
    await sendMessage(chat_id, commandsMessage);
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

// Answer a callback query (to show popup alerts)
async function answerCallbackQuery(callback_query_id, text, show_alert = false) {
  let payload = {
    callback_query_id,
    text,
    show_alert
  };
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Error answering callback query:", error);
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
  
  let keyboard = results.map((res) => {
    return [{ text: `▶️ ${res.channel.name}`, callback_data: `play_${res.index}` }];
  });
  await sendMessage(chat_id, `Search results for: \`${query}\``, { inline_keyboard: keyboard });
}

// Process custom URL submission (for channels)
async function processCustomUrl(chat_id, url) {
  // Create a custom channel entry with default name and provided URL
  const channelData = { name: "Custom Channel", url: url };
  customChannelsMap.set(chat_id, [channelData]);
  await sendMessage(chat_id, "Custom channel added successfully.");
}

// Process file upload for .m3u files and update custom channels for the user
async function processUploadedM3UFile(message) {
  const chat_id = message.chat.id;
  const file_id = message.document.file_id;
  // Fetch file information from Telegram
  const getFileUrl = `${TELEGRAM_API}/getFile?file_id=${file_id}`;
  let fileResponse;
  try {
    fileResponse = await fetch(getFileUrl);
  } catch (error) {
    console.error("Error fetching file info:", error);
    await sendMessage(chat_id, "Error processing the uploaded file. Please try again.");
    return;
  }
  const fileData = await fileResponse.json();
  if (!fileData.ok) {
    await sendMessage(chat_id, "Error retrieving file from Telegram.");
    return;
  }
  const filePath = fileData.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  let fileContentResponse;
  try {
    fileContentResponse = await fetch(fileUrl);
  } catch (error) {
    console.error("Error downloading file:", error);
    await sendMessage(chat_id, "Error downloading the file. Please try again.");
    return;
  }
  if (!fileContentResponse.ok) {
    await sendMessage(chat_id, "Error downloading the file. Please try again.");
    return;
  }
  const fileContent = await fileContentResponse.text();
  console.log("Fetched uploaded M3U Content:", fileContent);
  
  const regex = /#EXTINF.*?,\s*(.*?)\s*\n(http[^\s]+)/g;
  let match;
  let channels = [];
  
  while ((match = regex.exec(fileContent)) !== null) {
    channels.push({ name: match[1].trim(), url: match[2].trim() });
  }
  
  if (channels.length === 0) {
    await sendMessage(chat_id, "No channels found in the uploaded file.");
  } else {
    customChannelsMap.set(chat_id, channels);
    await sendMessage(chat_id, "Custom channels have been updated successfully from the uploaded file.");
  }
}

// Play a channel from the main channels list
async function playChannel(chat_id, id) {
  let channels = await fetchChannels();
  if (id < 0 || id >= channels.length) {
    await sendMessage(chat_id, "Invalid channel selection.");
    return;
  }
  const channel = channels[id];
  await sendMessage(chat_id, `Playing channel: ${channel.name}\nURL: ${channel.url}`);
}

// List custom channels with pagination
async function listCustomChannels(chat_id, page, message_id = null) {
  const CHANNELS_PER_PAGE_CUSTOM = 5;
  let channels = customChannelsMap.get(chat_id) || [];
  if (channels.length === 0) {
    if (message_id) {
      await editMessage(chat_id, message_id, "No custom channels found.");
    } else {
      await sendMessage(chat_id, "No custom channels found.");
    }
    return;
  }
  
  let start = page * CHANNELS_PER_PAGE_CUSTOM;
  let end = start + CHANNELS_PER_PAGE_CUSTOM;
  let paginatedChannels = channels.slice(start, end);
  
  let channelButtons = paginatedChannels.map((channel, index) => {
    return [{ text: `▶️ ${channel.name}`, callback_data: `custom_play_${start + index}` }];
  });
  let keyboard = channelButtons;
  
  let navigation = [];
  if (start > 0) navigation.push({ text: "⬅️ Previous", callback_data: `custom_channels_${page - 1}` });
  if (end < channels.length) navigation.push({ text: "Next ➡️", callback_data: `custom_channels_${page + 1}` });
  if (navigation.length) keyboard.push(navigation);
  
  const listMessage = "╔═🌟 Custom Channel List ☆═╗\nSelect a custom channel to play:";
  if (message_id) {
    await editMessage(chat_id, message_id, listMessage, { inline_keyboard: keyboard });
  } else {
    await sendMessage(chat_id, listMessage, { inline_keyboard: keyboard });
  }
}

// Play a custom channel from the user's custom channels list
async function playCustomChannel(chat_id, id) {
  let channels = customChannelsMap.get(chat_id) || [];
  if (id < 0 || id >= channels.length) {
    await sendMessage(chat_id, "Invalid custom channel selection.");
    return;
  }
  const channel = channels[id];
  await sendMessage(chat_id, `Playing custom channel: ${channel.name}\nURL: ${channel.url}`);
}
  
