/* No external dependencies are required */
const BOT_TOKEN = "7712981355:AAFAf6jUXWAI3Qjd0_RH0DxPNshhTDXchlc";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
let M3U_URL = "http://fortv.cc:8080/get.php?username=3RLR5J&password=0D4TinR&type=m3u";
const CHANNELS_PER_PAGE = 5;

let channelsCache = [];
let lastCacheTime = 0;
const CHANNELS_CACHE_TTL = 60000;

const customChannelsMap = new Map();
const pendingCustomUrlMap = new Map();
const pendingAdminUrlMap = new Map();
const pendingAdminBroadcastMap = new Map();
const subscribers = new Set();

const ADMIN_CHAT_ID = 6333020403;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

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

async function processTelegramMessage(message) {
  const chat_id = message.chat.id;
  const text = message.text;

  if (text === "/start") {
    // Auto-subscribe user to notifications
    subscribers.add(chat_id);

    let keyboard = {
      inline_keyboard: [
        [{ text: "📺 View Channels", callback_data: "channels_0" }],
        [{ text: "🚫 Unsubscribe", callback_data: "unsubscribe" }],
        [{ text: "📤 Share Bot", callback_data: "share_bot" }],
        [{ text: "➕ Add Bot to Group", callback_data: "group_add" }],
        [{ text: "Please paste and send your URL", callback_data: "custom_url" }],
        [{ text: "📤 Upload .m3u File", callback_data: "upload_m3u" }]
      ],
    };

    const welcomeMessage = "╔═🌟 Digital TV Menu ☆═╗\n\n" +
                           "✅ You have been automatically subscribed to notifications!\n" +
                           "Please select an option below:";
    await sendMessage(chat_id, welcomeMessage, keyboard);
  } else if (text === "/unsubscribe") {
    subscribers.delete(chat_id);
    await sendMessage(chat_id, "You have unsubscribed from notifications.");
  } else {
    await sendMessage(chat_id, "Unknown command.");
  }
}

async function processCallbackQuery(query) {
  const chat_id = query.message.chat.id;
  const data = query.data;

  if (data === "unsubscribe") {
    subscribers.delete(chat_id);
    await sendMessage(chat_id, "You have unsubscribed from notifications.");
  } else if (data === "share_bot") {
    await sendMessage(chat_id, "🔗 Share this bot with your friends: https://t.me/Freeiptvstream_bot");
  }
}

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
