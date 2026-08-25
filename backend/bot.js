import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = (process.env.WEB_APP_URL || process.env.VITE_APP_URL || "https://arcflow.vercel.app").replace(/\/$/, "");

console.log(`🌐 Telegram Mini App configured to open: ${webAppUrl}`);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: true });
  console.log("⚡ Telegram Bot initialized with polling...");

  // Catch polling errors
  bot.on("polling_error", (error) => {
    console.error("Telegram Polling Error:", error.message || error);
  });

  bot.on("error", (error) => {
    console.error("Telegram Bot Error:", error.message || error);
  });

  // Log all messages received
  bot.on("message", (msg) => {
    console.log(`[Telegram] Message from ${msg.from?.first_name} (@${msg.from?.username || "no_user"}): "${msg.text}"`);
  });

  // Command: /start
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name || "there";

    console.log(`[Telegram] Handling /start for chat ${chatId} (${name})`);

    const welcomeHtml = `
👋 <b>Welcome to ArcFlow, ${name}!</b>

One-tap global USDC transfers with instant proof, powered by <b>Arc Testnet</b>.

✨ <b>Features:</b>
• Send native USDC directly inside Telegram
• Generate shareable claim links & Pay Me links
• Real-time balance & transaction receipts

Tap the button below to launch the <b>ArcFlow Mini App</b>!
    `.trim();

    try {
      await bot.sendMessage(chatId, welcomeHtml, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open ArcFlow Mini App",
                web_app: { url: webAppUrl }
              }
            ],
            [
              { text: "🌐 ArcScan Explorer", url: "https://testnet.arcscan.app" },
              { text: "💧 USDC Faucet", url: "https://faucet.circle.com" }
            ]
          ]
        }
      });
      console.log(`[Telegram] Welcome message sent successfully to chat ${chatId}`);
    } catch (err) {
      console.error("[Telegram] Error sending /start response:", err.message);
      // Fallback to simple message if web_app button is rejected (e.g. if URL is not https)
      try {
        await bot.sendMessage(chatId, `Welcome to ArcFlow, ${name}! Visit ${webAppUrl} to use the app.`);
      } catch (e) {
        console.error("[Telegram] Fallback message failed:", e.message);
      }
    }
  });

  // Command: /help
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpHtml = `
🛠 <b>ArcFlow Bot Commands Guide</b>

• <b>/start</b> — Launch the Mini App and get started
• <b>/balance</b> — Check your connected Arc USDC balance
• <b>/paylink [amount] [note]</b> — Create a reusable Pay Me link
• <b>/help</b> — View this guide
    `.trim();

    try {
      await bot.sendMessage(chatId, helpHtml, { parse_mode: "HTML" });
    } catch (err) {
      console.error("[Telegram] Error sending /help response:", err.message);
    }
  });

  // Command: /balance
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;

    const messageHtml = `
💳 <b>Your ArcFlow Account</b>

Launch the Mini App below to view your real-time USDC balance and transfer history.
    `.trim();

    try {
      await bot.sendMessage(chatId, messageHtml, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open Mini App",
                web_app: { url: webAppUrl }
              }
            ]
          ]
        }
      });
    } catch (err) {
      console.error("[Telegram] Error sending /balance response:", err.message);
    }
  });

  // Command: /paylink <amount> [note]
  bot.onText(/\/paylink(?:\s+(\d+))?(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const amount = match?.[1] || "50";
    const note = match?.[2] || "Payment Request";
    const slug = `tg-${Date.now().toString(36)}`;
    const linkUrl = `${webAppUrl}/flow/${slug}`;

    if (supabase) {
      try {
        await supabase.from("flow_links").insert({
          slug,
          amount_usdc: Number(amount),
          note,
          creator_privy_id: `telegram:${msg.from.id}`
        });
      } catch (err) {
        console.warn("[Telegram] Could not save flow link to Supabase:", err.message);
      }
    }

    const paylinkHtml = `
🔗 <b>Pay Me Link Created!</b>

💰 <b>Amount:</b> $${amount} USDC
📝 <b>Note:</b> "${note}"

Share this link with anyone to receive payments directly to your ArcFlow wallet:
<code>${linkUrl}</code>
    `.trim();

    try {
      await bot.sendMessage(chatId, paylinkHtml, { parse_mode: "HTML" });
    } catch (err) {
      console.error("[Telegram] Error sending /paylink response:", err.message);
    }
  });
} else {
  console.log("ℹ️ TELEGRAM_BOT_TOKEN not provided in .env. Bot script running in placeholder mode.");
}

export function startBotServer() {
  if (bot) {
    console.log("⚡ Telegram Bot is ready and listening for commands.");
  }
}
