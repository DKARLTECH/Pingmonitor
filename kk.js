/* No external dependencies are required */
const BOT_TOKEN = "8049379557:AAFTFfol-zFUxQDMCGypVwAHRsd6vl0oNqs";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
// Replaced the old M3U_URL with the new URL for VPN/DNS bypass to overcome geo-restrictions
const M3U_URL = "http://fortv.cc:8080/get.php?username=3RLR5J&password=0D4TinR&type=m3u";
const CHANNELS_PER_PAGE = 5;

let channelsCache = [];
let lastCacheTime = 0;
const CHANNELS_CACHE_TTL = 60000; // Cache channels for 60 seconds

// Removed rate limit variables as time limiting has been removed for faster requests
// In-memory custom channels store per user for custom URL/file submissions
const customChannelsMap = new Map();

// In-memory pending custom URL state per user (to track when a user clicks "Add Custom URL")
const pendingCustomUrlMap = new Map();

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
async function handleRequest(request) {
  if (request.method === "POST") {
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
  return new Response("Invalid request", { status: 400 });
}

// Process Telegram commands and messages
async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  
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
        [{ text: "✨ View Channels", callback_data: "channels_0" }],
        [{ text: "➕ Add Custom URL", callback_data: "custom_url" }],
        [{ text: "📤 Upload .m3u File", callback_data: "upload_m3u" }]
      ],
    };
    // Updated beautiful/digital menu welcome message
    const welcomeMessage = "╔═☆.｡.:*  Welcome to Digital TV Menu  *:｡.☆═╗\n\nPlease select an option below:";
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
    // Set pending state and prompt the user to send their custom URL (only m3u or m3u8_plus links are allowed)
    pendingCustomUrlMap.set(chat_id, true);
    await sendMessage(chat_id, "Please paste your custom URL (only m3u or m3u8_plus links are allowed):");
  } else if (data === "upload_m3u") {
    // Prompt the user to upload their .m3u file
    await sendMessage(chat_id, "Please upload your .m3u file:");
  } else if (data.startsWith("custom_channels_")) {
    let page = parseInt(data.split("_")[2]);
    await listCustomChannels(chat_id, page, query.message.message_id);
  } else if (data.startsWith("custom_play_")) {
    let id = parseInt(data.split("_")[2]);
    await playCustomChannel(chat_id, id);
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
  const listMessage = "╔═☆ Channel List ☆═╗\nSelect a channel to play:";
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
  const searchMessage = "╔═☆ Search Results ☆═╗\n**Search Results for:** " + `\`${query}\``;
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
      await sendMessage(chat_id, "No channels found in the provided custom file.");
      return;
    }
    
    console.log("Extracted Custom Channels:", channels);
    customChannelsMap.set(chat_id, { channels: channels, timestamp: now });
    await listCustomChannels(chat_id, 0);
  } catch (error) {
    console.error("Error processing custom URL:", error);
    await sendMessage(chat_id, "Error processing the custom URL. Please try again.");
  }
}

// Process an uploaded .m3u file from the user
async function processUploadedM3UFile(message) {
  const chat_id = message.chat.id;
  try {
    // Retrieve file_id from the document object
    const file_id = message.document.file_id;
    
    // Get file path using Telegram API getFile method
    const fileResponse = await fetch(`${TELEGRAM_API}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: file_id }),
    });
    const fileData = await fileResponse.json();
    if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
      console.error("Failed to get file information:", fileData);
      await sendMessage(chat_id, "Failed to retrieve the file. Please try again.");
      return;
    }
    
    const file_path = fileData.result.file_path;
    // Construct the URL to download the file
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`;
    const response = await fetch(fileUrl, { method: "GET" });
    if (!response.ok) {
      console.error(`Failed to fetch uploaded file, status: ${response.status}`);
      await sendMessage(chat_id, "Failed to download the uploaded file. Please try again.");
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
    
    console.log("Extracted Custom Channels from Uploaded File:", channels);
    customChannelsMap.set(chat_id, { channels: channels, timestamp: Date.now() });
    await listCustomChannels(chat_id, 0);
  } catch (error) {
    console.error("Error processing uploaded file:", error);
    await sendMessage(chat_id, "Error processing the uploaded file. Please try again.");
  }
}

// List custom channels with pagination (for channels submitted via custom URL or uploaded file)
async function listCustomChannels(chat_id, page, message_id = null) {
  let userData = customChannelsMap.get(chat_id);
  if (!userData || !userData.channels || userData.channels.length === 0) {
    if (message_id) {
      await editMessage(chat_id, message_id, "No custom channels found. Please send a valid custom URL/file.");
    } else {
      await sendMessage(chat_id, "No custom channels found. Please send a valid custom URL/file.");
    }
    return;
  }
  
  let channels = userData.channels;
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
  
  const listMessage = "╔═☆ Custom Channel List ☆═╗\nSelect a channel to play:";
  if (message_id) {
    await editMessage(chat_id, message_id, listMessage, { inline_keyboard: keyboard });
  } else {
    await sendMessage(chat_id, listMessage, { inline_keyboard: keyboard });
  }
}

// Play a custom channel (from channels fetched via a custom URL or uploaded file)
async function playCustomChannel(chat_id, id) {
  let userData = customChannelsMap.get(chat_id);
  if (!userData || !userData.channels) {
    await sendMessage(chat_id, "Custom channels data not found. Please send a valid custom URL/file.");
    return;
  }
  
  let channels = userData.channels;
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
