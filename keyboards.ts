import { Markup } from "telegraf";

export const mainMenuKeyboard = Markup.keyboard([
  ["🤝 Создать сделку"],
  ["💼 Кошелек", "📈 Моя статистика"],
  ["🆘 Поддержка", "📋 Инструкция"],
]).resize();

export const cancelKeyboard = Markup.keyboard([["❌ Отмена"]]).resize();

export const currencyKeyboard = Markup.keyboard([
  ["ГРН 🇺🇦", "РУБ 🇷🇺"],
  ["TON 💎", "Stars ⭐"],
  ["❌ Отмена"],
]).resize();

export const currencyInlineKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🇷🇺 РУБ", "currency_rub"),
    Markup.button.callback("🇺🇦 ГРН", "currency_uah"),
  ],
  [
    Markup.button.callback("💎 TON", "currency_ton"),
    Markup.button.callback("⭐ Звёзды", "currency_stars"),
  ],
]);

export const confirmDealKeyboard = Markup.keyboard([
  ["✅ Подтвердить сделку", "❌ Отмена"],
]).resize();

export function buyerDealKeyboard(dealCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💰 Оплатить", `pay_${dealCode}`)],
    [Markup.button.callback("❌ Отказаться", `cancel_${dealCode}`)],
  ]);
}

export function dealActionKeyboard(dealCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💰 Оплатить сделку", `pay_${dealCode}`)],
    [Markup.button.callback("❌ Отменить сделку", `cancel_${dealCode}`)],
  ]);
}

export function adminDealKeyboard(dealCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Завершить сделку", `complete_${dealCode}`)],
    [Markup.button.callback("❌ Отменить и вернуть", `refund_${dealCode}`)],
  ]);
}
