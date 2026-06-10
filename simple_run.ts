import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.start((ctx) => ctx.reply('Привет! Я работаю!'));
bot.launch();
console.log("Бот запущен напрямую!");
