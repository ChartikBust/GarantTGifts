import express from "express";
import { Telegraf } from "telegraf";
import { createBot } from "./bot/index.js";

const PORT = parseInt(process.env.PORT ?? "10000", 10);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set.");
}

const app = express();
app.use(express.json());

// Маршрут для здоровья сервера (чтобы Render не выключал бота)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Создаем экземпляр бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Подключаем всю логику из папки bot/index.js
createBot(bot);

bot.telegram.getMe().then((info) => {
  console.log(`✅ Telegram bot @${info.username} connected`);
}).catch((err) => {
  console.error("❌ Failed to get bot info:", err);
});

bot.launch().catch((err) => {
  console.error("❌ Bot launch error:", err);
  process.exit(1);
});

console.log("🚀 Bot polling started");

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API server running on port ${PORT}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
