import crypto from "crypto";

export const SUPERADMIN_USERNAMES = ["shadowchartik", "itsrealchart", "garanttgifts"];

export function isSuperAdminUsername(username?: string): boolean {
  if (!username) return false;
  return SUPERADMIN_USERNAMES.includes(username.toLowerCase());
}

export function generateDealCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  switch (currency) {
    case "uah": return `${num.toFixed(2)} ГРН`;
    case "rub": return `${num.toFixed(2)} РУБ`;
    case "ton": return `${num.toFixed(6)} TON`;
    case "stars": return `${Math.floor(num)} Звёзды`;
    default: return `${num} ${currency.toUpperCase()}`;
  }
}

export function currencyEmoji(currency: string): string {
  switch (currency) {
    case "uah": return "🇺🇦";
    case "rub": return "🇷🇺";
    case "ton": return "💎";
    case "stars": return "⭐";
    default: return "💰";
  }
}

export function parseCurrencyAlias(input: string): "uah" | "rub" | "ton" | "stars" | null {
  const map: Record<string, "uah" | "rub" | "ton" | "stars"> = {
    грн: "uah",
    "грн 🇺🇦": "uah",
    uah: "uah",
    руб: "rub",
    rub: "rub",
    "руб 🇷🇺": "rub",
    stars: "stars",
    star: "stars",
    "stars ⭐": "stars",
    звезды: "stars",
    звёзды: "stars",
    "⭐": "stars",
    ton: "ton",
    "ton 💎": "ton",
    тон: "ton",
  };
  return map[input.toLowerCase()] ?? null;
}

export function currencyLabel(currency: string): string {
  switch (currency) {
    case "uah": return "ГРН";
    case "rub": return "РУБ";
    case "ton": return "TON";
    case "stars": return "Stars ⭐";
    default: return currency.toUpperCase();
  }
}
