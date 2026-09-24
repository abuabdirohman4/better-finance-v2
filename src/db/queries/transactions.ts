import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions, categories, accounts } from "@/db/schema";

export interface TransactionRow {
  id: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  note: string | null;
  account_id: string;
  account_name: string;
  category_id: string | null;
  category_name: string | null;
  to_account_id: string | null;
  to_account_name: string | null;
  goal_id: string | null;
  debt_id: string | null;
}

export interface TransactionFilters {
  type?: string[];        // ["spending","earning","transfer"]
  account_id?: string[];
  category_id?: string[];
  note?: string;
  date_from?: string;     // YYYY-MM-DD
  date_to?: string;
  limit?: number;
  offset?: number;
}

export async function getTransactions(
  userId: string,
  filters: TransactionFilters = {}
): Promise<TransactionRow[]> {
  const toAccounts = db.$with("to_acc").as(
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.user_id, userId))
  );

  const q = db
    .with(toAccounts)
    .select({
      id: transactions.id,
      transaction_date: transactions.transaction_date,
      transaction_type: transactions.transaction_type,
      amount: transactions.amount,
      note: transactions.note,
      account_id: transactions.account_id,
      account_name: accounts.name,
      category_id: transactions.category_id,
      category_name: categories.name,
      to_account_id: transactions.to_account_id,
      to_account_name: toAccounts.name,
      goal_id: transactions.goal_id,
      debt_id: transactions.debt_id,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.account_id))
    .leftJoin(categories, eq(categories.id, transactions.category_id))
    .leftJoin(toAccounts, eq(toAccounts.id, transactions.to_account_id))
    .where(
      and(
        eq(transactions.user_id, userId),
        isNull(transactions.deleted_at),
        filters.type?.length
          ? or(...filters.type.map((t) => eq(transactions.transaction_type, t)))
          : undefined,
        filters.account_id?.length
          ? or(...filters.account_id.map((id) => eq(transactions.account_id, id)))
          : undefined,
        filters.category_id?.length
          ? or(...filters.category_id.map((id) => eq(transactions.category_id, id)))
          : undefined,
        filters.note
          ? sql`${transactions.note} ilike ${"%" + filters.note + "%"}`
          : undefined,
        filters.date_from ? gte(transactions.transaction_date, filters.date_from) : undefined,
        filters.date_to ? lte(transactions.transaction_date, filters.date_to) : undefined,
      )
    )
    .orderBy(desc(transactions.transaction_date), desc(transactions.created_at))
    .limit(filters.limit ?? 200)
    .offset(filters.offset ?? 0);

  const rows = await q;
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}

import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/schemas/transaction";

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput
): Promise<string> {
  const [row] = await db
    .insert(transactions)
    .values({
      user_id: userId,
      transaction_date: input.transaction_date,
      transaction_type: input.transaction_type,
      account_id: input.account_id,
      to_account_id: input.to_account_id ?? null,
      category_id: input.category_id ?? null,
      goal_id: input.goal_id ?? null,
      debt_id: input.debt_id ?? null,
      amount: String(input.amount),
      note: input.note ?? null,
    })
    .returning({ id: transactions.id });
  return row.id;
}

export async function getTransactionById(
  userId: string,
  txId: string
): Promise<TransactionRow | null> {
  const toAccounts = db.$with("to_acc").as(
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.user_id, userId))
  );

  const rows = await db
    .with(toAccounts)
    .select({
      id: transactions.id,
      transaction_date: transactions.transaction_date,
      transaction_type: transactions.transaction_type,
      amount: transactions.amount,
      note: transactions.note,
      account_id: transactions.account_id,
      account_name: accounts.name,
      category_id: transactions.category_id,
      category_name: categories.name,
      to_account_id: transactions.to_account_id,
      to_account_name: toAccounts.name,
      goal_id: transactions.goal_id,
      debt_id: transactions.debt_id,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.account_id))
    .leftJoin(categories, eq(categories.id, transactions.category_id))
    .leftJoin(toAccounts, eq(toAccounts.id, transactions.to_account_id))
    .where(
      and(
        eq(transactions.id, txId),
        eq(transactions.user_id, userId),
        isNull(transactions.deleted_at)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  return { ...rows[0], amount: Number(rows[0].amount) };
}


export async function updateTransaction(
  userId: string,
  txId: string,
  input: UpdateTransactionInput
): Promise<void> {
  const values: Record<string, unknown> = { updated_at: new Date() };
  if (input.transaction_date !== undefined) values.transaction_date = input.transaction_date;
  if (input.transaction_type !== undefined) values.transaction_type = input.transaction_type;
  if (input.account_id !== undefined) values.account_id = input.account_id;
  if ("to_account_id" in input) values.to_account_id = input.to_account_id ?? null;
  if ("category_id" in input) values.category_id = input.category_id ?? null;
  if ("goal_id" in input) values.goal_id = input.goal_id ?? null;
  if ("debt_id" in input) values.debt_id = input.debt_id ?? null;
  if (input.amount !== undefined) values.amount = String(input.amount);
  if ("note" in input) values.note = input.note ?? null;

  await db
    .update(transactions)
    .set(values)
    .where(and(eq(transactions.id, txId), eq(transactions.user_id, userId), isNull(transactions.deleted_at)));
}

export async function softDeleteTransaction(userId: string, txId: string): Promise<void> {
  await db
    .update(transactions)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(and(eq(transactions.id, txId), eq(transactions.user_id, userId)));
}
