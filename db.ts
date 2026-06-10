import { eq, sql, desc, count, and, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  walletsTable,
  walletTransactionsTable,
  dealsTable,
  adminsTable,
  type User,
  type Wallet,
  type Admin,
} from "@workspace/db";

export async function upsertUser(telegramId: number, data: {
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<User> {
  const [user] = await db
    .insert(usersTable)
    .values({ telegramId, ...data })
    .onConflictDoUpdate({
      target: usersTable.telegramId,
      set: {
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
      },
    })
    .returning();
  return user;
}

export async function getOrCreateWallet(telegramId: number): Promise<Wallet> {
  const existing = await db.query.walletsTable.findFirst({
    where: eq(walletsTable.telegramId, telegramId),
  });
  if (existing) return existing;
  const [wallet] = await db
    .insert(walletsTable)
    .values({ telegramId })
    .returning();
  return wallet;
}

export async function getWalletByTelegramId(telegramId: number): Promise<Wallet | undefined> {
  return db.query.walletsTable.findFirst({
    where: eq(walletsTable.telegramId, telegramId),
  });
}

export async function addBalance(
  telegramId: number,
  currency: "uah" | "rub" | "ton" | "stars",
  amount: number,
  description?: string,
): Promise<Wallet> {
  await db.insert(walletsTable).values({ telegramId }).onConflictDoNothing();
  const col = walletsTable[currency];
  const [wallet] = await db
    .update(walletsTable)
    .set({ [currency]: sql`${col} + ${amount}`, updatedAt: new Date() })
    .where(eq(walletsTable.telegramId, telegramId))
    .returning();
  await db.insert(walletTransactionsTable).values({
    telegramId,
    currency,
    amount: String(amount),
    type: "deposit",
    description: description ?? "Пополнение баланса",
  });
  return wallet;
}

export async function deductBalance(
  telegramId: number,
  currency: "uah" | "rub" | "ton" | "stars",
  amount: number,
  description?: string,
): Promise<Wallet | null> {
  const wallet = await getOrCreateWallet(telegramId);
  const current = parseFloat(wallet[currency] as string);
  if (current < amount) return null;
  const col = walletsTable[currency];
  const [updated] = await db
    .update(walletsTable)
    .set({ [currency]: sql`${col} - ${amount}`, updatedAt: new Date() })
    .where(eq(walletsTable.telegramId, telegramId))
    .returning();
  await db.insert(walletTransactionsTable).values({
    telegramId,
    currency,
    amount: String(amount),
    type: "withdrawal",
    description: description ?? "Оплата сделки",
  });
  return updated;
}

export async function getTransactionHistory(telegramId: number, limit = 10) {
  return db.query.walletTransactionsTable.findMany({
    where: eq(walletTransactionsTable.telegramId, telegramId),
    orderBy: [desc(walletTransactionsTable.createdAt)],
    limit,
  });
}

export async function getUserStats(telegramId: number) {
  const asSeller = await db.query.dealsTable.findMany({
    where: eq(dealsTable.sellerTelegramId, telegramId),
  });
  const asBuyer = await db.query.dealsTable.findMany({
    where: eq(dealsTable.buyerTelegramId, telegramId),
  });
  return {
    seller: {
      total: asSeller.length,
      completed: asSeller.filter((d) => d.status === "completed").length,
      active: asSeller.filter((d) => d.status === "active" || d.status === "pending").length,
    },
    buyer: {
      total: asBuyer.length,
      paid: asBuyer.filter((d) => d.status === "active" || d.status === "completed").length,
    },
  };
}

export async function isAdmin(telegramId: number): Promise<boolean> {
  const admin = await db.query.adminsTable.findFirst({
    where: eq(adminsTable.telegramId, telegramId),
  });
  return !!admin;
}

export async function isSuperAdmin(telegramId: number): Promise<boolean> {
  const admin = await db.query.adminsTable.findFirst({
    where: and(
      eq(adminsTable.telegramId, telegramId),
      eq(adminsTable.role, "superadmin"),
    ),
  });
  return !!admin;
}

export async function getAllAdmins(): Promise<Admin[]> {
  return db.query.adminsTable.findMany();
}

export async function getAllAdminIds(): Promise<number[]> {
  const admins = await db.query.adminsTable.findMany();
  return admins.map((a) => a.telegramId);
}

export async function addAdmin(telegramId: number, addedBy: number, role = "admin"): Promise<void> {
  await db
    .insert(adminsTable)
    .values({ telegramId, role, addedByTelegramId: addedBy })
    .onConflictDoNothing();
}

export async function removeAdmin(telegramId: number): Promise<void> {
  await db.delete(adminsTable).where(eq(adminsTable.telegramId, telegramId));
}

export async function getUserCount(): Promise<number> {
  const [res] = await db.select({ count: count() }).from(usersTable);
  return Number(res?.count ?? 0);
}

export async function getAdminDealStats() {
  const all = await db.query.dealsTable.findMany({
    orderBy: [desc(dealsTable.createdAt)],
  });
  return {
    total: all.length,
    pending: all.filter((d) => d.status === "pending").length,
    active: all.filter((d) => d.status === "active").length,
    completed: all.filter((d) => d.status === "completed").length,
    cancelled: all.filter((d) => d.status === "cancelled").length,
    openDeals: all.filter((d) => d.status === "pending" || d.status === "active"),
  };
}

export async function createDeal(data: {
  dealCode: string;
  sellerTelegramId: number;
  description: string;
  amount: string;
  currency: string;
}) {
  const [deal] = await db.insert(dealsTable).values(data).returning();
  return deal;
}

export async function getDealByCode(dealCode: string) {
  return db.query.dealsTable.findFirst({
    where: eq(dealsTable.dealCode, dealCode),
  });
}

export async function payDeal(dealCode: string, buyerTelegramId: number) {
  const [deal] = await db
    .update(dealsTable)
    .set({ buyerTelegramId, status: "active", updatedAt: new Date() })
    .where(eq(dealsTable.dealCode, dealCode))
    .returning();
  return deal;
}

export async function completeDeal(dealCode: string) {
  const [deal] = await db
    .update(dealsTable)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(dealsTable.dealCode, dealCode))
    .returning();
  return deal;
}

export async function cancelDeal(dealCode: string) {
  const [deal] = await db
    .update(dealsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(dealsTable.dealCode, dealCode))
    .returning();
  return deal;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | undefined> {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.telegramId, telegramId),
  });
}

export async function getUserDealHistory(telegramId: number) {
  const [asSeller, asBuyer] = await Promise.all([
    db.query.dealsTable.findMany({
      where: eq(dealsTable.sellerTelegramId, telegramId),
      orderBy: [desc(dealsTable.createdAt)],
      limit: 10,
    }),
    db.query.dealsTable.findMany({
      where: eq(dealsTable.buyerTelegramId, telegramId),
      orderBy: [desc(dealsTable.createdAt)],
      limit: 10,
    }),
  ]);
  return { asSeller, asBuyer };
}
