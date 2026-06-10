import express from "express";
import { Telegraf, Markup } from "telegraf";

const PORT = parseInt(process.env.PORT ?? "10000", 10);
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Здесь твои кнопки:
bot.command('start', (ctx) => {
  ctx.reply('Привет! Выбери действие:', Markup.keyboard([
    ['🤝 Создать сделку'],
    ['💼 Кошелек']
  ]).oneTime().resize());
});

bot.hears('🤝 Создать сделку', (ctx) => ctx.reply('Начинаем создание сделки...'));
bot.hears('💼 Кошелек', (ctx) => ctx.reply('Ваш кошелек: 0 руб.'));

bot.launch();
app.listen(PORT, "0.0.0.0");
console.log("🚀 Bot is running!");
