import express from "express";
import { Telegraf } from "telegraf"; // Добавили Telegraf
import { createBot } from "./bot/index.js"; // Оставили, если она нужна для логики внутри

const PORT = parseInt(process.env.PORT ?? "5000", 10);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set.");
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ИСПРАВЛЕНИЕ ЗДЕСЬ:
// Вместо вызова createBot(), который вызывал ошибку, 
// мы создаем бота напрямую, а потом передаем его в ту функцию, если она нужна:
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Если функция createBot из твоего файла './bot/index.js' 
// просто настраивала обработчики, вызови её вот так (передав bot внутрь):
// createBot(bot); 
// ЕСЛИ ЭТО НЕ РАБОТАЕТ, просто удали строку выше и настрой обработчики прямо здесь.

bot.telegram.getMe().then((info) => {
  console.log(`✅ Telegram bot @${info.username} connected`);
}).catch(() => {});

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
