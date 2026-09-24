import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, accountTypes, categories, transactions } from "@/db/schema";
import { deriveInvestmentGroup } from "@/lib/investment";

// ── Types (query results — numeric kolom di-cast ke number) ─────────────────────

export interface AccountRow {
  id: string;
  name: string;
  slug: string;
  current_balance: number;
  last_reality_check: number | null;
  last_reality_check_at: string | null;
  asset_category: string;
  investment_group: string | null;
  icon_name: string | null;
  color_hex: string | null;
  is_active: boolean;
  is_wallet: boolean;
  include_in_net_worth: boolean;
  is_liability: boolean;
  sort_order: number;
  account_type_slug: string;
  account_type_name: string;
}

export interface RecentTransactionRow {
  id: string;
  transaction_date: string;
  transaction_type: string;
  note: string | null;
  amount: number;
  category_name: string | null;
}

export interface DashboardData {
  accounts: AccountRow[];
  totalAssets: number;
  recentTransactions: RecentTransactionRow[];
}

// ── Queries ─────────────────────────────────────────────────────────────────────

/** Semua akun aktif milik user, join account_type, urut sort_order. */
export async function getAccountsWithType(userId: string): Promise<AccountRow[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      slug: accounts.slug,
      current_balance: accounts.current_balance,
      last_reality_check: accounts.last_reality_check,
      last_reality_check_at: accounts.last_reality_check_at,
      asset_category: accounts.asset_category,
      investment_group: accounts.investment_group,
      icon_name: accounts.icon_name,
      color_hex: accounts.color_hex,
      is_active: accounts.is_active,
      is_wallet: accounts.is_wallet,
      include_in_net_worth: accounts.include_in_net_worth,
      is_liability: accounts.is_liability,
      sort_order: accounts.sort_order,
      account_type_slug: accountTypes.slug,
      account_type_name: accountTypes.name,
    })
    .from(accounts)
    .innerJoin(accountTypes, eq(accountTypes.id, accounts.account_type_id))
    .where(and(eq(accounts.user_id, userId), eq(accounts.is_active, true)))
    .orderBy(accounts.sort_order);

  return rows.map(mapAccountRow);
}

/** Data dashboard: akun + total assets + transaksi terbaru. */
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [accountRows, txRows] = await Promise.all([
    getAccountsWithType(userId),
    db
      .select({
        id: transactions.id,
        transaction_date: transactions.transaction_date,
        transaction_type: transactions.transaction_type,
        note: transactions.note,
        amount: transactions.amount,
        category_name: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.category_id))
      .where(and(eq(transactions.user_id, userId), isNull(transactions.deleted_at)))
      .orderBy(desc(transactions.transaction_date), desc(transactions.created_at))
      .limit(5),
  ]);

  const totalAssets = accountRows
    .filter((a) => a.include_in_net_worth)
    .reduce((sum, a) => sum + a.current_balance, 0); // natural sign: liabilities already negative (bf-13t)

  const recentTransactions: RecentTransactionRow[] = txRows.map((t) => ({
    id: t.id,
    transaction_date: t.transaction_date,
    transaction_type: t.transaction_type,
    note: t.note,
    amount: Number(t.amount),
    category_name: t.category_name,
  }));

  return { accounts: accountRows, totalAssets, recentTransactions };
}

// ── Mutations ───────────────────────────────────────────────────────────────────

/** Semua tipe akun milik user, urut sort_order. */
export async function getAccountTypes(
  userId: string
): Promise<{ id: string; name: string; slug: string }[]> {
  return db
    .select({ id: accountTypes.id, name: accountTypes.name, slug: accountTypes.slug })
    .from(accountTypes)
    .where(eq(accountTypes.user_id, userId))
    .orderBy(accountTypes.sort_order);
}

import type { CreateAccountInput, UpdateAccountInput } from "@/lib/schemas/account";

export async function createAccount(userId: string, input: CreateAccountInput): Promise<string> {
  const slug = input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const [row] = await db
    .insert(accounts)
    .values({
      user_id: userId,
      account_type_id: input.account_type_id,
      name: input.name,
      slug,
      current_balance: String(input.current_balance),
      asset_category: input.asset_category,
      investment_group:
        input.asset_category === "investment"
          ? (input.investment_group?.trim() || deriveInvestmentGroup(input.name))
          : null,
      include_in_net_worth: input.include_in_net_worth ?? true,
      is_wallet: input.is_wallet ?? false,
      is_liability: input.is_liability ?? false,
      sort_order: input.sort_order,
    })
    .returning({ id: accounts.id });
  return row.id;
}



export async function updateAccount(
  userId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<void> {
  const values: Record<string, unknown> = {
    updated_at: new Date(),
  };
  if (input.name !== undefined) {
    values.name = input.name;
    values.slug = input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }
  if (input.current_balance !== undefined) values.current_balance = String(input.current_balance);
  if (input.account_type_id !== undefined) values.account_type_id = input.account_type_id;
  if (input.asset_category !== undefined) values.asset_category = input.asset_category;
  if (input.investment_group !== undefined)
    values.investment_group = input.investment_group?.trim() || null;
  if (input.include_in_net_worth !== undefined) values.include_in_net_worth = input.include_in_net_worth;
  if (input.is_wallet !== undefined) values.is_wallet = input.is_wallet;
  if (input.is_liability !== undefined) values.is_liability = input.is_liability;
  if (input.sort_order !== undefined) values.sort_order = input.sort_order;

  await db
    .update(accounts)
    .set(values)
    .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
}

export async function deactivateAccount(userId: string, accountId: string): Promise<void> {
  await db
    .update(accounts)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
}

/** Satu akun aktif milik user by ID, join account_type. */
export async function getAccountById(
  userId: string,
  accountId: string
): Promise<AccountRow | null> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      slug: accounts.slug,
      current_balance: accounts.current_balance,
      last_reality_check: accounts.last_reality_check,
      last_reality_check_at: accounts.last_reality_check_at,
      asset_category: accounts.asset_category,
      investment_group: accounts.investment_group,
      icon_name: accounts.icon_name,
      color_hex: accounts.color_hex,
      is_active: accounts.is_active,
      is_wallet: accounts.is_wallet,
      include_in_net_worth: accounts.include_in_net_worth,
      is_liability: accounts.is_liability,
      sort_order: accounts.sort_order,
      account_type_slug: accountTypes.slug,
      account_type_name: accountTypes.name,
    })
    .from(accounts)
    .innerJoin(accountTypes, eq(accountTypes.id, accounts.account_type_id))
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.user_id, userId),
        eq(accounts.is_active, true)
      )
    )
    .limit(1);

  return rows.length > 0 ? mapAccountRow(rows[0]) : null;
}

/** Update last_reality_check + last_reality_check_at untuk satu akun. */
export async function updateRealityCheck(
  userId: string,
  accountId: string,
  realityBalance: number
): Promise<void> {
  await db
    .update(accounts)
    .set({
      last_reality_check: String(realityBalance),
      last_reality_check_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
}

/** Harga pasar manual (bf-3ai). null = hapus valuasi. Tidak menyentuh current_balance/Net Worth. */
export async function updateAccountValue(
  userId: string,
  accountId: string,
  value: number | null
): Promise<void> {
  await db
    .update(accounts)
    .set({
      current_value: value == null ? null : String(value),
      last_valued_at: value == null ? null : new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
}

/**
 * Update current_balance dengan delta atomik.
 * spending → delta negatif, earning → delta positif,
 * transfer → panggil 2x: -amount source, +amount dest.
 */
export async function adjustAccountBalance(
  userId: string,
  accountId: string,
  delta: number   // positive = add, negative = subtract
): Promise<void> {
  await db
    .update(accounts)
    .set({
      current_balance: sql`${accounts.current_balance} + ${String(delta)}`,
      updated_at: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

// postgres-js kembalikan numeric sebagai string → cast ke number
function mapAccountRow(r: {
  id: string;
  name: string;
  slug: string;
  current_balance: string;
  last_reality_check: string | null;
  last_reality_check_at: Date | null;
  asset_category: string;
  investment_group: string | null;
  icon_name: string | null;
  color_hex: string | null;
  is_active: boolean;
  is_wallet: boolean;
  include_in_net_worth: boolean;
  is_liability: boolean;
  sort_order: number;
  account_type_slug: string;
  account_type_name: string;
}): AccountRow {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    current_balance: Number(r.current_balance),
    last_reality_check: r.last_reality_check == null ? null : Number(r.last_reality_check),
    last_reality_check_at: r.last_reality_check_at ? r.last_reality_check_at.toISOString() : null,
    asset_category: r.asset_category,
    investment_group: r.investment_group,
    icon_name: r.icon_name,
    color_hex: r.color_hex,
    is_active: r.is_active,
    include_in_net_worth: r.include_in_net_worth,
    is_wallet: r.is_wallet,
    is_liability: r.is_liability,
    sort_order: r.sort_order,
    account_type_slug: r.account_type_slug,
    account_type_name: r.account_type_name,
  };
}

// ── Categories ───────────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  group_name: string;
  icon_name: string | null;
}

/** Semua kategori aktif milik user, urut sort_order. */
export async function getCategories(userId: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      group_name: categories.group_name,
      icon_name: categories.icon_name,
    })
    .from(categories)
    .where(and(eq(categories.user_id, userId), eq(categories.is_active, true)))
    .orderBy(categories.sort_order);
}


import { createClient } from "@/lib/supabase/server";

export async function applyTransactionBalancesRpc(
  userId: string,
  adjustments: { account_id: string; delta: number }[]
): Promise<void> {
  if (adjustments.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_transaction_balances", {
    p_user_id: userId,
    p_adjustments: adjustments,
  });
  if (error) throw new Error(`Balance RPC failed: ${error.message}`);
}
