import { Telegraf, session } from "telegraf";
import type { Context, Telegraf as TelegrafType } from "telegraf";
import { message } from "telegraf/filters";
import {
  mainMenuKeyboard,
  cancelKeyboard,
  currencyInlineKeyboard,
  buyerDealKeyboard,
  dealActionKeyboard,
  adminDealKeyboard,
} from "./keyboards.js";
import {
  upsertUser,
  getOrCreateWallet,
  getWalletByTelegramId,
  addBalance,
  deductBalance,
  getTransactionHistory,
  getUserStats,
  isAdmin,
  isSuperAdmin,
  getAllAdmins,
  getAllAdminIds,
  addAdmin,
  removeAdmin,
  getUserCount,
  getAdminDealStats,
  createDeal,
  getDealByCode,
  payDeal,
  completeDeal,
  cancelDeal,
  getUserByTelegramId,
  getUserDealHistory,
} from "./db.js";
import {
  generateDealCode,
  formatCurrency,
  parseCurrencyAlias,
  currencyLabel,
  currencyEmoji,
  isSuperAdminUsername,
} from "./utils.js";
import { type SessionData, defaultSession } from "./session.js";

type BotContext = Context & { session: SessionData };

async function notifyAdmins(bot: TelegrafType<BotContext>, message: string, extra?: object) {
  const adminIds = await getAllAdminIds();
  for (const id of adminIds) {
    await bot.telegram.sendMessage(id, message, { parse_mode: "HTML", ...extra }).catch(() => {});
  }
}

function walletBalanceText(wallet: {
  uah: string | number;
  rub: string | number;
  ton: string | number;
  stars: string | number;
}): string {
  return (
    `▪ ${formatCurrency(wallet.uah, "uah")}\n` +
    `▪ ${formatCurrency(wallet.rub, "rub")}\n` +
    `▪ ${formatCurrency(wallet.ton, "ton")}\n` +
    `▪ ${formatCurrency(wallet.stars, "stars")}`
  );
}

export function createBot(token: string) {
  const bot = new Telegraf<BotContext>(token);

  bot.use(session({ defaultSession }));

  // Auto-register user + auto-promote superadmins by username
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      await upsertUser(ctx.from.id, {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
      }).catch(() => {});

      if (ctx.from.username && isSuperAdminUsername(ctx.from.username)) {
        const already = await isSuperAdmin(ctx.from.id).catch(() => false);
        if (!already) {
          await addAdmin(ctx.from.id, ctx.from.id, "superadmin").catch(() => {});
        }
      }
    }
    return next();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /start
  // ─────────────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const startParam = ctx.startPayload;

    if (startParam?.startsWith("deal_")) {
      const dealCode = startParam.slice(5);
      const deal = await getDealByCode(dealCode);

      if (!deal) {
        return ctx.reply("❌ Сделка не найдена.", mainMenuKeyboard);
      }
      if (deal.status !== "pending") {
        const labels: Record<string, string> = {
          active: "уже оплачена ⏳",
          completed: "завершена ✅",
          cancelled: "отменена ❌",
        };
        return ctx.reply(
          `❌ Сделка #${dealCode} ${labels[deal.status] ?? "недоступна"}.`,
          mainMenuKeyboard,
        );
      }
      if (deal.sellerTelegramId === ctx.from.id) {
        return ctx.reply(
          `ℹ️ Это ваша собственная сделка #${dealCode}.\nОжидайте, когда покупатель перейдёт по ссылке и оплатит.`,
          mainMenuKeyboard,
        );
      }

      const currency = deal.currency as "uah" | "rub" | "ton" | "stars";
      const amount = parseFloat(deal.amount);
      const wallet = await getOrCreateWallet(ctx.from.id);
      const currentBalance = parseFloat(wallet[currency] as string);
      const hasEnough = currentBalance >= amount;

      ctx.session = defaultSession();

      const dealText =
        `🤝 <b>Сделка #${dealCode}</b>\n\n` +
        `📦 Товар: <b>${deal.description}</b>\n` +
        `💵 Сумма: <b>${formatCurrency(deal.amount, deal.currency)}</b>\n` +
        `👤 Продавец: <code>${deal.sellerTelegramId}</code>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💳 Ваш баланс: <b>${formatCurrency(currentBalance, currency)}</b>\n` +
        (hasEnough
          ? `✅ Средств достаточно для оплаты`
          : `❌ Недостаточно средств!\n📩 Пополните баланс — напишите @GarantTGifts`);

      if (!hasEnough) {
        return ctx.reply(dealText, { parse_mode: "HTML", ...mainMenuKeyboard });
      }

      return ctx.reply(
        dealText + `\n━━━━━━━━━━━━━━━━━━━━\n\n👇 Нажмите <b>Оплатить</b> для подтверждения:`,
        { parse_mode: "HTML", ...buyerDealKeyboard(dealCode) },
      );
    }

    ctx.session = defaultSession();
    await ctx.reply(
      `🏆 <b>Добро пожаловать в NFT Гарант Бот!</b>\n\n` +
      `🛡 Я — безопасный посредник (гарант) при обмене цифровых товаров:\n` +
      `• NFT и цифровых активов\n` +
      `• Игровых скинов, предметов, аккаунтов\n` +
      `• Подарков Telegram (Stars)\n` +
      `• Игровых валют и криптовалют\n\n` +
      `⚙️ <b>Что умеет бот:</b>\n` +
      `🔷 Создание защищённых сделок за 1 минуту\n` +
      `🔷 Кошелёк с несколькими валютами (ГРН, РУБ, TON, Звёзды)\n` +
      `🔷 Уведомления продавцу и покупателю в реальном времени\n` +
      `🔷 Поддержка 24/7 — ответ до 5 минут\n\n` +
      `🚀 Выберите раздел кнопками снизу`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /add — пополнение баланса по Telegram ID (доступно всем)
  // Формат: /add <telegram_id> <сумма> <валюта>
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("add", async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length !== 4) {
      return ctx.reply(
        `❌ Неверный формат.\n\nФормат: <code>/add &lt;telegram_id&gt; &lt;сумма&gt; &lt;валюта&gt;</code>\n\n` +
        `Пример: <code>/add 7160255701 500 stars</code>\n\n` +
        `Валюты: <code>грн</code> · <code>руб</code> · <code>stars</code> · <code>ton</code>`,
        { parse_mode: "HTML" },
      );
    }

    const [, rawId, rawAmount, rawCurrency] = parts;
    const targetId = parseInt(rawId, 10);
    if (isNaN(targetId) || targetId <= 0) {
      return ctx.reply("❌ Неверный Telegram ID.", { parse_mode: "HTML" });
    }

    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("❌ Неверная сумма. Введите положительное число.");
    }

    const currency = parseCurrencyAlias(rawCurrency);
    if (!currency) {
      return ctx.reply(`❌ Неизвестная валюта.\nДоступные: <code>грн</code>, <code>руб</code>, <code>stars</code>, <code>ton</code>`, { parse_mode: "HTML" });
    }

    // Максимальные лимиты по валютам (защита от переполнения БД)
    const MAX_AMOUNT: Record<string, number> = {
      uah: 9_999_999,
      rub: 9_999_999,
      ton: 99_999,
      stars: 9_999_999,
    };
    if (amount > (MAX_AMOUNT[currency] ?? 9_999_999)) {
      return ctx.reply(
        `❌ Сумма слишком большая.\n\n` +
        `Максимум для ${currencyLabel(currency)}: <b>${(MAX_AMOUNT[currency] ?? 9_999_999).toLocaleString("ru-RU")}</b>`,
        { parse_mode: "HTML" },
      );
    }

    const senderLabel = ctx.from.username ? `@${ctx.from.username}` : `<code>${ctx.from.id}</code>`;
    const updatedWallet = await addBalance(targetId, currency, amount,
      `Пополнение от ${ctx.from.username ? "@" + ctx.from.username : ctx.from.id}`);

    await ctx.reply(
      `✅ Баланс пользователя <code>${targetId}</code> пополнен на <b>${formatCurrency(amount, currency)}</b>\n\n` +
      `💼 Текущий баланс:\n${walletBalanceText(updatedWallet)}`,
      { parse_mode: "HTML" },
    );

    // Уведомить всех админов о пополнении
    const senderIsAdmin = await isAdmin(ctx.from.id);
    await notifyAdmins(
      bot,
      `💳 <b>Пополнение баланса</b>\n\n` +
      `👤 Пользователь: <code>${targetId}</code>\n` +
      `➕ Сумма: <b>${formatCurrency(amount, currency)}</b>\n` +
      `💼 Новый баланс:\n${walletBalanceText(updatedWallet)}\n\n` +
      `🔧 Выполнил: ${senderLabel}${senderIsAdmin ? " (админ)" : ""}`,
      {},
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 💼 Кошелёк
  // ─────────────────────────────────────────────────────────────────────────
  bot.hears("💼 Кошелек", async (ctx) => {
    ctx.session = defaultSession();
    const wallet = await getOrCreateWallet(ctx.from.id);
    await ctx.reply(
      `💼 <b>Ваш кошелёк</b>\n\n` +
      `🆔 Ваш ID для пополнения: <code>${ctx.from.id}</code>\n\n` +
      `💵 <b>Текущий баланс:</b>\n${walletBalanceText(wallet)}\n\n` +
      `ℹ️ Баланс используется для оплаты сделок в боте.\n\n` +
      `📩 <b>Как пополнить баланс:</b>\n` +
      `1. Напишите @GarantTGifts\n` +
      `2. Сообщите ваш ID: <code>${ctx.from.id}</code>\n` +
      `3. Укажите нужную сумму и валюту\n` +
      `4. Оплатите удобным способом\n\n` +
      `⏱ Зачисление в течение 5-10 минут после подтверждения оплаты.`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 📈 Моя статистика
  // ─────────────────────────────────────────────────────────────────────────
  bot.hears("📈 Моя статистика", async (ctx) => {
    ctx.session = defaultSession();
    const [stats, wallet] = await Promise.all([
      getUserStats(ctx.from.id),
      getOrCreateWallet(ctx.from.id),
    ]);
    await ctx.reply(
      `📈 <b>Ваша личная статистика</b>\n\n` +
      `🆔 Ваш ID: <code>${ctx.from.id}</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 <b>Как продавец:</b>\n` +
      `▪ Создано сделок: ${stats.seller.total}\n` +
      `▪ Завершено: ${stats.seller.completed}\n` +
      `▪ Активных: ${stats.seller.active}\n\n` +
      `🛒 <b>Как покупатель:</b>\n` +
      `▪ Оплачено сделок: ${stats.buyer.paid} из ${stats.buyer.total}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💼 <b>Текущий баланс:</b>\n${walletBalanceText(wallet)}\n\n` +
      `📩 Для пополнения обратитесь в 🆘 Поддержку.`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 🆘 Поддержка
  // ─────────────────────────────────────────────────────────────────────────
  bot.hears("🆘 Поддержка", async (ctx) => {
    ctx.session = defaultSession();
    await ctx.reply(
      `🆘 <b>Служба поддержки NFT Гарант Бота</b>\n\n` +
      `👤 Официальный менеджер: @GarantTGifts\n` +
      `⏱ Время ответа: до 5 минут\n\n` +
      `📋 <b>Чем помогаем:</b>\n` +
      `• Спорные ситуации между продавцом и покупателем\n` +
      `• Пополнение баланса любой валютой\n` +
      `• Возврат средств при отмене сделки\n` +
      `• Технические неполадки\n` +
      `• Консультация по безопасным сделкам\n\n` +
      `⚠️ <b>Осторожно, мошенники!</b>\n` +
      `Единственный официальный аккаунт — @GarantTGifts.\n` +
      `Не отвечайте на сообщения от других аккаунтов с похожими именами.`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Inline callbacks — выбор валюты при создании сделки
  // ─────────────────────────────────────────────────────────────────────────
  async function finishDealCreation(ctx: BotContext, currency: "uah" | "rub" | "ton" | "stars") {
    const { description, amount } = ctx.session.dealDraft;
    if (!description || !amount) {
      ctx.session = defaultSession();
      return ctx.reply("❌ Ошибка. Начните заново.", mainMenuKeyboard);
    }

    const dealCode = generateDealCode();
    await createDeal({ dealCode, sellerTelegramId: ctx.from!.id, description, amount, currency });

    ctx.session = defaultSession();
    const botInfo = await ctx.telegram.getMe();
    const inviteLink = `https://t.me/${botInfo.username}?start=deal_${dealCode}`;

    await ctx.reply(
      `✅ <b>Сделка успешно создана!</b>\n\n` +
      `📦 Товар: ${description}\n` +
      `💵 Цена: ${formatCurrency(amount, currency)}\n` +
      `🆔 ID сделки: ${dealCode}\n\n` +
      `🔗 <b>Ссылка для покупателя:</b>\n${inviteLink}\n\n` +
      `📋 <b>Что делать дальше:</b>\n` +
      `1. Скопируйте ссылку выше\n` +
      `2. Отправьте её покупателю\n` +
      `3. Дождитесь уведомления об оплате\n` +
      `4. Передайте товар @GarantTGifts\n\n` +
      `⏳ Ссылка активна до момента оплаты.`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );

    await notifyAdmins(
      bot,
      `🗒 <b>Новая сделка создана!</b>\n\n` +
      `🆔 #${dealCode}\n` +
      `📦 ${description}\n` +
      `💵 ${formatCurrency(amount, currency)}\n` +
      `👤 Продавец: <code>${ctx.from!.id}</code>`,
      {},
    );
  }

  const currencyActions: Array<["currency_uah" | "currency_rub" | "currency_ton" | "currency_stars", "uah" | "rub" | "ton" | "stars", string]> = [
    ["currency_uah",   "uah",   "🇺🇦 ГРН"],
    ["currency_rub",   "rub",   "🇷🇺 РУБ"],
    ["currency_ton",   "ton",   "💎 TON"],
    ["currency_stars", "stars", "⭐ Звёзды"],
  ];

  for (const [action, currency, label] of currencyActions) {
    bot.action(action, async (ctx) => {
      // Всегда отвечаем на callback сразу — это останавливает спиннер
      await ctx.answerCbQuery(`${label} выбрана`).catch(() => {});

      if (ctx.session.step !== "awaiting_currency") {
        return ctx.reply("❌ Сессия истекла. Начните создание сделки заново.", mainMenuKeyboard);
      }

      const { description, amount } = ctx.session.dealDraft;
      if (!description || !amount) {
        ctx.session = defaultSession();
        return ctx.reply("❌ Данные сделки потеряны. Начните заново.", mainMenuKeyboard);
      }

      // Убираем кнопки у старого сообщения
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

      try {
        await finishDealCreation(ctx, currency);
      } catch (err) {
        console.error(`[currency_action ${action}]`, err);
        ctx.session = defaultSession();
        await ctx.reply("❌ Ошибка при создании сделки. Попробуйте ещё раз.", mainMenuKeyboard);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 📋 Инструкция
  // ─────────────────────────────────────────────────────────────────────────
  bot.hears("📋 Инструкция", async (ctx) => {
    ctx.session = defaultSession();
    await ctx.reply(
      `📖 <b>Как создать безопасную сделку — пошагово</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>Шаг 1 — Продавец создаёт сделку:</b>\n` +
      `Нажмите 🤝 Создать сделку и следуйте инструкциям. Вы введёте название товара, цену и валюту. Бот выдаст уникальную ссылку.\n\n` +
      `<b>Шаг 2 — Покупатель переходит по ссылке:</b>\n` +
      `Отправьте ссылку покупателю. Он открывает её в Telegram, видит все детали сделки и нажимает «Оплатить». Средства списываются с его баланса в боте.\n\n` +
      `<b>Шаг 3 — Передача товара:</b>\n` +
      `Продавец передаёт товар менеджеру @GarantTGifts. Менеджер проверяет товар и переводит деньги продавцу.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>Примеры успешных сделок:</b>\n` +
      `• NFT Notcoin #4821 за 12 TON — закрыто за 8 минут\n` +
      `• Скин AK-47 Redline MW CS2 за 3 200 руб — без споров\n` +
      `• Подарок Telegram 500 Stars — мгновенная оплата\n` +
      `• Аккаунт Steam с MMR 4500 — проверен и передан\n\n` +
      `💡 <b>Важно:</b> Пополните баланс через поддержку перед первой сделкой. Для оплаты нужны средства на счёте в боте.`,
      { parse_mode: "HTML", ...mainMenuKeyboard },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 🤝 Создать сделку — пошаговый флоу
  // ─────────────────────────────────────────────────────────────────────────
  bot.hears("🤝 Создать сделку", async (ctx) => {
    ctx.session = { step: "awaiting_description", dealDraft: {} };
    await ctx.reply(
      `🤝 <b>Создание сделки — Шаг 1 из 3</b>\n\n` +
      `📦 Введите название товара или услуги:\n\n` +
      `✅ Примеры:\n` +
      `• Скин AK-47 Redline MW CS2\n` +
      `• NFT Notcoin #4821\n` +
      `• Подарок Telegram 500 Stars\n` +
      `• Аккаунт Steam MMR 4500\n` +
      `• Игровая валюта 10 000 золота\n\n` +
      `✏️ Напишите название в следующем сообщении:`,
      { parse_mode: "HTML", ...cancelKeyboard },
    );
  });

  bot.hears("❌ Отмена", async (ctx) => {
    ctx.session = defaultSession();
    await ctx.reply("❌ Отменено.", mainMenuKeyboard);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Inline callbacks — оплата / отмена / завершение / возврат
  // ─────────────────────────────────────────────────────────────────────────
  bot.action(/^pay_(.+)$/, async (ctx) => {
    const dealCode = ctx.match[1];
    const deal = await getDealByCode(dealCode);
    if (!deal || deal.status !== "pending") {
      return ctx.answerCbQuery("❌ Сделка недоступна.");
    }
    if (deal.sellerTelegramId === ctx.from.id) {
      return ctx.answerCbQuery("❌ Вы продавец, оплатить нельзя.");
    }

    const currency = deal.currency as "uah" | "rub" | "ton" | "stars";
    const amount = parseFloat(deal.amount);

    const updated = await deductBalance(ctx.from.id, currency, amount, `Оплата сделки #${dealCode}`);
    if (!updated) {
      await ctx.answerCbQuery("❌ Недостаточно средств!");
      return ctx.reply(
        `❌ <b>Недостаточно средств</b> для оплаты сделки.\n\nПополните баланс через 🆘 Поддержку.`,
        { parse_mode: "HTML" },
      );
    }

    const paid = await payDeal(dealCode, ctx.from.id);
    await ctx.answerCbQuery("✅ Сделка оплачена!");
    await ctx.editMessageText(
      `💰 <b>Сделка #${dealCode} оплачена!</b>\n\n` +
      `📦 ${deal.description}\n` +
      `💰 ${formatCurrency(deal.amount, deal.currency)}\n\n` +
      `⏳ Ожидайте передачи товара через @GarantTGifts`,
      { parse_mode: "HTML" },
    );

    // Уведомить продавца
    await bot.telegram.sendMessage(
      deal.sellerTelegramId,
      `💰 <b>Сделка #${dealCode} оплачена!</b>\n\n` +
      `📦 ${deal.description}\n` +
      `💰 ${formatCurrency(deal.amount, deal.currency)}\n` +
      `🛒 Покупатель: <code>${ctx.from.id}</code>\n\n` +
      `⚡ Требуется передача товара через @GarantTGifts`,
      { parse_mode: "HTML" },
    ).catch(() => {});

    // Уведомить всех админов
    await notifyAdmins(
      bot,
      `💰 <b>Сделка оплачена!</b>\n\n` +
      `🆔 #${dealCode}\n` +
      `📦 ${deal.description}\n` +
      `💵 ${formatCurrency(deal.amount, deal.currency)}\n` +
      `👤 Продавец: <code>${deal.sellerTelegramId}</code>\n` +
      `🛒 Покупатель: <code>${ctx.from.id}</code>\n\n` +
      `⚡ Требуется передача товара через @GarantTGifts`,
      adminDealKeyboard(dealCode),
    );
  });

  bot.action(/^cancel_(.+)$/, async (ctx) => {
    const dealCode = ctx.match[1];
    const deal = await getDealByCode(dealCode);
    if (!deal) return ctx.answerCbQuery("❌ Сделка не найдена.");
    if (deal.sellerTelegramId !== ctx.from.id && !(await isAdmin(ctx.from.id))) {
      return ctx.answerCbQuery("❌ Нет прав для отмены.");
    }
    await cancelDeal(dealCode);
    await ctx.answerCbQuery("✅ Сделка отменена.");
    await ctx.editMessageText(
      `❌ <b>Сделка #${dealCode} отменена.</b>`,
      { parse_mode: "HTML" },
    );
    await notifyAdmins(bot, `❌ <b>Сделка #${dealCode} отменена</b>\n📦 ${deal.description}`, {});
  });

  bot.action(/^complete_(.+)$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCbQuery("❌ Нет прав.");
    const dealCode = ctx.match[1];
    const deal = await getDealByCode(dealCode);
    if (!deal) return ctx.answerCbQuery("❌ Сделка не найдена.");

    await completeDeal(dealCode);

    // Перевести деньги продавцу
    const currency = deal.currency as "uah" | "rub" | "ton" | "stars";
    await addBalance(deal.sellerTelegramId, currency, parseFloat(deal.amount), `Выплата за сделку #${dealCode}`);

    await ctx.answerCbQuery("✅ Сделка завершена!");
    await ctx.editMessageText(
      `✅ <b>Сделка #${dealCode} завершена!</b>\n\n` +
      `📦 ${deal.description}\n` +
      `💰 ${formatCurrency(deal.amount, deal.currency)}\n` +
      `👤 Продавец <code>${deal.sellerTelegramId}</code> получил оплату.`,
      { parse_mode: "HTML" },
    );

    await bot.telegram.sendMessage(
      deal.sellerTelegramId,
      `✅ <b>Сделка #${dealCode} завершена!</b>\n\n` +
      `💰 На ваш баланс начислено: <b>${formatCurrency(deal.amount, deal.currency)}</b>`,
      { parse_mode: "HTML" },
    ).catch(() => {});

    if (deal.buyerTelegramId) {
      await bot.telegram.sendMessage(
        deal.buyerTelegramId,
        `✅ <b>Сделка #${dealCode} завершена!</b>\n\n` +
        `📦 Товар: ${deal.description}\n` +
        `Спасибо за использование NFT Гарант Бота!`,
        { parse_mode: "HTML" },
      ).catch(() => {});
    }
  });

  bot.action(/^refund_(.+)$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCbQuery("❌ Нет прав.");
    const dealCode = ctx.match[1];
    const deal = await getDealByCode(dealCode);
    if (!deal || !deal.buyerTelegramId) return ctx.answerCbQuery("❌ Сделка не найдена или не оплачена.");

    await cancelDeal(dealCode);

    // Вернуть деньги покупателю
    const currency = deal.currency as "uah" | "rub" | "ton" | "stars";
    await addBalance(deal.buyerTelegramId, currency, parseFloat(deal.amount), `Возврат по сделке #${dealCode}`);

    await ctx.answerCbQuery("✅ Возврат выполнен.");
    await ctx.editMessageText(
      `↩️ <b>Сделка #${dealCode} отменена. Возврат выполнен.</b>\n\n` +
      `💰 Покупателю <code>${deal.buyerTelegramId}</code> возвращено: <b>${formatCurrency(deal.amount, deal.currency)}</b>`,
      { parse_mode: "HTML" },
    );

    await bot.telegram.sendMessage(
      deal.buyerTelegramId,
      `↩️ <b>Возврат по сделке #${dealCode}</b>\n\n` +
      `💰 На ваш баланс возвращено: <b>${formatCurrency(deal.amount, deal.currency)}</b>`,
      { parse_mode: "HTML" },
    ).catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /admin — панель администратора
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) {
      return ctx.reply("❌ У вас нет прав администратора.");
    }

    const [userCount, stats, superAdmin] = await Promise.all([
      getUserCount(),
      getAdminDealStats(),
      isSuperAdmin(ctx.from.id),
    ]);

    const roleLabel = superAdmin ? "⭐ Суперадмин" : "👮 Админ";

    const openDealsText = stats.openDeals.length > 0
      ? stats.openDeals.map((d) =>
          `  • #${d.dealCode} — ${d.description} — ${formatCurrency(d.amount, d.currency)} — ` +
          `продавец <code>${d.sellerTelegramId}</code>` +
          (d.buyerTelegramId ? `, покупатель <code>${d.buyerTelegramId}</code>` : "")
        ).join("\n")
      : "  Нет открытых сделок";

    await ctx.reply(
      `🔧 <b>Панель администратора — ${roleLabel}</b>\n\n` +
      `👥 Пользователей: ${userCount}\n\n` +
      `📊 <b>Статистика сделок:</b>\n` +
      `▪ Всего: ${stats.total}\n` +
      `▪ Ожидают оплаты: ${stats.pending}\n` +
      `▪ Активных: ${stats.active}\n` +
      `▪ Завершённых: ${stats.completed}\n` +
      `▪ Отменённых: ${stats.cancelled}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔓 <b>Открытые сделки (${stats.openDeals.length}):</b>\n${openDealsText}\n\n` +
      (superAdmin
        ? `━━━━━━━━━━━━━━━━━━━━\n` +
          `👮 <b>Управление админами:</b>\n` +
          `/addadmin &lt;telegram_id&gt; — добавить админа\n` +
          `/removeadmin &lt;telegram_id&gt; — удалить админа\n` +
          `/admins — список всех админов\n\n`
        : "") +
      `📌 <b>Другие команды:</b>\n` +
      `/balance &lt;telegram_id&gt; — баланс пользователя\n` +
      `/history &lt;telegram_id&gt; — история транзакций и сделок\n` +
      `/deal &lt;code&gt; — детали сделки\n` +
      (superAdmin
        ? `/add &lt;telegram_id&gt; &lt;сумма&gt; &lt;валюта&gt; — пополнить баланс\n` +
          `/deduct &lt;telegram_id&gt; &lt;сумма&gt; &lt;валюта&gt; — списать баланс`
        : `/add &lt;telegram_id&gt; &lt;сумма&gt; &lt;валюта&gt; — пополнить баланс`),
      { parse_mode: "HTML" },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /addadmin — добавить админа (только суперадмин)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("addadmin", async (ctx) => {
    if (!(await isSuperAdmin(ctx.from.id))) {
      return ctx.reply("❌ Только суперадмины могут добавлять админов.");
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply("Формат: <code>/addadmin &lt;telegram_id&gt;</code>", { parse_mode: "HTML" });
    }
    const targetId = parseInt(parts[1], 10);
    if (isNaN(targetId)) return ctx.reply("❌ Неверный Telegram ID.");
    await addAdmin(targetId, ctx.from.id, "admin");
    await ctx.reply(`✅ Пользователь <code>${targetId}</code> добавлен как администратор.`, { parse_mode: "HTML" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /removeadmin — удалить админа (только суперадмин)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("removeadmin", async (ctx) => {
    if (!(await isSuperAdmin(ctx.from.id))) {
      return ctx.reply("❌ Только суперадмины могут удалять админов.");
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply("Формат: <code>/removeadmin &lt;telegram_id&gt;</code>", { parse_mode: "HTML" });
    }
    const targetId = parseInt(parts[1], 10);
    if (isNaN(targetId)) return ctx.reply("❌ Неверный Telegram ID.");
    if (await isSuperAdmin(targetId)) {
      return ctx.reply("❌ Нельзя удалить суперадмина.");
    }
    await removeAdmin(targetId);
    await ctx.reply(`✅ Администратор <code>${targetId}</code> удалён.`, { parse_mode: "HTML" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /admins — список всех админов
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("admins", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.reply("❌ Нет прав.");
    const admins = await getAllAdmins();
    if (admins.length === 0) return ctx.reply("Список администраторов пуст.");
    const lines = admins.map((a) =>
      `▪ <code>${a.telegramId}</code> — ${a.role === "superadmin" ? "⭐ Суперадмин" : "👮 Админ"}`
    );
    await ctx.reply(`👮 <b>Администраторы (${admins.length}):</b>\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /balance — посмотреть баланс пользователя (только админы)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("balance", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.reply("❌ Нет прав.");
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply("Формат: <code>/balance &lt;telegram_id&gt;</code>", { parse_mode: "HTML" });
    }
    const targetId = parseInt(parts[1], 10);
    if (isNaN(targetId)) return ctx.reply("❌ Неверный ID.");
    const wallet = await getWalletByTelegramId(targetId);
    if (!wallet) return ctx.reply(`❌ Кошелёк пользователя <code>${targetId}</code> не найден.`, { parse_mode: "HTML" });
    await ctx.reply(
      `💼 <b>Баланс пользователя <code>${targetId}</code>:</b>\n\n${walletBalanceText(wallet)}`,
      { parse_mode: "HTML" },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /deduct — списание баланса пользователя (только суперадмины)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("deduct", async (ctx) => {
    if (!(await isSuperAdmin(ctx.from.id))) {
      return ctx.reply("❌ Только суперадмины могут списывать средства.");
    }

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 4) {
      return ctx.reply(
        `Формат: <code>/deduct &lt;telegram_id&gt; &lt;сумма&gt; &lt;валюта&gt;</code>\n\n` +
        `Пример: <code>/deduct 7160255701 500 грн</code>\n\n` +
        `Валюты: <code>грн</code> · <code>руб</code> · <code>stars</code> · <code>ton</code>`,
        { parse_mode: "HTML" },
      );
    }

    const targetId = parseInt(parts[1], 10);
    if (isNaN(targetId) || targetId <= 0) {
      return ctx.reply("❌ Неверный Telegram ID.", { parse_mode: "HTML" });
    }

    const amount = parseFloat(parts[2]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("❌ Неверная сумма. Введите положительное число.");
    }

    const currency = parseCurrencyAlias(parts[3]);
    if (!currency) {
      return ctx.reply(
        `❌ Неизвестная валюта.\nДоступные: <code>грн</code>, <code>руб</code>, <code>stars</code>, <code>ton</code>`,
        { parse_mode: "HTML" },
      );
    }

    const wallet = await getWalletByTelegramId(targetId);
    if (!wallet) {
      return ctx.reply(`❌ Кошелёк пользователя <code>${targetId}</code> не найден.`, { parse_mode: "HTML" });
    }

    const senderLabel = ctx.from.username ? `@${ctx.from.username}` : `<code>${ctx.from.id}</code>`;
    const updatedWallet = await deductBalance(
      targetId, currency, amount,
      `Списание от ${ctx.from.username ? "@" + ctx.from.username : ctx.from.id}`,
    );

    if (!updatedWallet) {
      const currentBalance = parseFloat(wallet[currency] as string);
      return ctx.reply(
        `❌ Недостаточно средств.\n\n` +
        `Запрошено: <b>${formatCurrency(amount, currency)}</b>\n` +
        `На балансе: <b>${formatCurrency(currentBalance, currency)}</b>`,
        { parse_mode: "HTML" },
      );
    }

    await ctx.reply(
      `✅ Списано <b>${formatCurrency(amount, currency)}</b> у пользователя <code>${targetId}</code>\n\n` +
      `💼 Текущий баланс:\n${walletBalanceText(updatedWallet)}`,
      { parse_mode: "HTML" },
    );

    await notifyAdmins(
      bot,
      `➖ <b>Списание баланса</b>\n\n` +
      `👤 Пользователь: <code>${targetId}</code>\n` +
      `➖ Сумма: <b>${formatCurrency(amount, currency)}</b>\n` +
      `💼 Новый баланс:\n${walletBalanceText(updatedWallet)}\n\n` +
      `🔧 Выполнил: ${senderLabel} (суперадмин)`,
      {},
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /deal — детали сделки (только админы)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("deal", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.reply("❌ Нет прав.");
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply("Формат: <code>/deal &lt;code&gt;</code>", { parse_mode: "HTML" });
    }
    const deal = await getDealByCode(parts[1].toUpperCase());
    if (!deal) return ctx.reply("❌ Сделка не найдена.");
    const statusLabels: Record<string, string> = {
      pending: "⏳ Ожидает оплаты",
      active: "🔄 Активна",
      completed: "✅ Завершена",
      cancelled: "❌ Отменена",
    };
    await ctx.reply(
      `📋 <b>Сделка #${deal.dealCode}</b>\n\n` +
      `📦 ${deal.description}\n` +
      `💰 ${formatCurrency(deal.amount, deal.currency)}\n` +
      `📊 Статус: ${statusLabels[deal.status] ?? deal.status}\n` +
      `👤 Продавец: <code>${deal.sellerTelegramId}</code>\n` +
      `🛒 Покупатель: ${deal.buyerTelegramId ? `<code>${deal.buyerTelegramId}</code>` : "нет"}\n` +
      `🕐 Создана: ${deal.createdAt.toLocaleString("ru-RU")}`,
      { parse_mode: "HTML", ...(deal.status === "active" ? adminDealKeyboard(deal.dealCode) : {}) },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /history — история транзакций и сделок пользователя (только админы)
  // ─────────────────────────────────────────────────────────────────────────
  bot.command("history", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.reply("❌ Нет прав.");

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply(
        `Формат: <code>/history &lt;telegram_id&gt;</code>\n\nПример: <code>/history 7160255701</code>`,
        { parse_mode: "HTML" },
      );
    }

    const targetId = parseInt(parts[1], 10);
    if (isNaN(targetId)) return ctx.reply("❌ Неверный Telegram ID.");

    const [user, wallet, txs, deals] = await Promise.all([
      getUserByTelegramId(targetId),
      getWalletByTelegramId(targetId),
      getTransactionHistory(targetId, 20),
      getUserDealHistory(targetId),
    ]);

    // ── Заголовок пользователя ──
    const userLabel = user
      ? `${user.firstName ?? ""}${user.lastName ? " " + user.lastName : ""}${user.username ? " (@" + user.username + ")" : ""}`.trim() || `ID ${targetId}`
      : `ID ${targetId} (не зарегистрирован)`;

    let msg = `👤 <b>${userLabel}</b>\n<code>${targetId}</code>\n\n`;

    // ── Баланс ──
    if (wallet) {
      msg += `💼 <b>Баланс:</b>\n${walletBalanceText(wallet)}\n\n`;
    } else {
      msg += `💼 <b>Баланс:</b> кошелёк не найден\n\n`;
    }

    // ── Транзакции ──
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 <b>Транзакции (последние ${txs.length}):</b>\n`;
    if (txs.length === 0) {
      msg += `  нет транзакций\n`;
    } else {
      for (const tx of txs) {
        const sign = tx.type === "deposit" ? "➕" : "➖";
        const date = new Date(tx.createdAt).toLocaleString("ru-RU", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        msg += `${sign} <b>${formatCurrency(tx.amount, tx.currency)}</b> — ${tx.description ?? tx.type} <i>${date}</i>\n`;
      }
    }

    // ── Сделки как продавец ──
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏷 <b>Сделки как продавец (${deals.asSeller.length}):</b>\n`;
    if (deals.asSeller.length === 0) {
      msg += `  нет сделок\n`;
    } else {
      const statusIcon: Record<string, string> = {
        pending: "⏳", active: "🔄", completed: "✅", cancelled: "❌",
      };
      for (const d of deals.asSeller) {
        msg += `${statusIcon[d.status] ?? "•"} #${d.dealCode} — ${d.description} — <b>${formatCurrency(d.amount, d.currency)}</b>\n`;
      }
    }

    // ── Сделки как покупатель ──
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🛒 <b>Сделки как покупатель (${deals.asBuyer.length}):</b>\n`;
    if (deals.asBuyer.length === 0) {
      msg += `  нет сделок\n`;
    } else {
      const statusIcon: Record<string, string> = {
        pending: "⏳", active: "🔄", completed: "✅", cancelled: "❌",
      };
      for (const d of deals.asBuyer) {
        msg += `${statusIcon[d.status] ?? "•"} #${d.dealCode} — ${d.description} — <b>${formatCurrency(d.amount, d.currency)}</b>\n`;
      }
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Пошаговый обработчик текстовых сообщений (создание сделки)
  // ─────────────────────────────────────────────────────────────────────────
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text.trim();
    const { step } = ctx.session;

    // Шаг 1 → получили название, просим цену
    if (step === "awaiting_description") {
      ctx.session.dealDraft.description = text;
      ctx.session.step = "awaiting_amount";
      return ctx.reply(
        `✅ Название сохранено: <b>${text}</b>\n\n` +
        `💰 Шаг 2 из 3 — Введите цену:\n\n` +
        `✅ Примеры:\n` +
        `• <code>500</code> — целое число\n` +
        `• <code>1250</code> — тысячи\n` +
        `• <code>12.5</code> — дробное число\n` +
        `• <code>0.05</code> — малые суммы (например TON)\n\n` +
        `✏️ Напишите цену в следующем сообщении:`,
        { parse_mode: "HTML", ...cancelKeyboard },
      );
    }

    // Шаг 2 → получили цену, показываем инлайн-кнопки для валюты
    if (step === "awaiting_amount") {
      const amount = parseFloat(text.replace(",", "."));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Неверная сумма. Введите положительное число:");
      }
      ctx.session.dealDraft.amount = String(amount);
      ctx.session.step = "awaiting_currency";
      return ctx.reply(
        `✅ Цена сохранена: <b>${amount}</b>\n\n` +
        `$¥ Шаг 3 из 3 — Выберите валюту:\n\n` +
        `Нажмите на нужную валюту ниже 👇`,
        { parse_mode: "HTML", ...currencyInlineKeyboard },
      );
    }
  });

  // Глобальный обработчик ошибок — всегда отвечаем на callback чтобы не было вечной загрузки
  bot.catch(async (err, ctx) => {
    console.error(`[bot.catch] Update type: ${ctx.updateType}`, err);
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery("❌ Произошла ошибка").catch(() => {});
      }
      if ("message" in ctx.update || ctx.callbackQuery) {
        await ctx.reply("❌ Произошла внутренняя ошибка. Попробуйте ещё раз или нажмите /start.", mainMenuKeyboard).catch(() => {});
      }
    } catch (_) {}
  });

  return bot;
}
