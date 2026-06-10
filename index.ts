import express from "express";
import { createBot } from "./bot/index.js";

const PORT = parseInt(process.env.PORT ?? "5000", 10);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set.");
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const bot = createBot(process.env.TELEGRAM_BOT_TOKEN);

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
