import express from "express";
import { Telegraf } from "telegraf"; // Добавляем импорт Telegraf

const PORT = parseInt(process.env.PORT ?? "5000", 10);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set.");
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Инициализируем бота напрямую, без вызова createBot()
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Сюда можно добавить твои команды
bot.command('start', (ctx) => ctx.reply('Привет! Я запущен!'));

bot.telegram.getMe().then((info) => {
  console.log(`✅ Telegram bot @${info.username} connected`);
}).catch((err) => console.error("Ошибка подключения:", err));

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
