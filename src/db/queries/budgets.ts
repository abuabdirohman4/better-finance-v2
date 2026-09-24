import { and, eq, inArray, sql, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, transactions, accounts } from "@/db/schema";

export interface BudgetRow {
  id: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  group_name: string;
  budgeted_amount: number;
  note: string | null;
  budget_year: number;
  budget_month: number;
}

export interface BudgetWithSpending extends BudgetRow {
  actual_spending: number;
  percent: number; // actual / budgeted * 100
}

/** Semua budget rows untuk bulan tertentu */
export async function getBudgets(
  userId: string,
  year: number,
  month: number
): Promise<BudgetRow[]> {
  const rows = await db
    .select({
      id: budgets.id,
      category_id: budgets.category_id,
      category_name: sql<string>`COALESCE(${categories.name}, '')`,
      category_slug: categories.slug,
      group_name: categories.group_name,
      budgeted_amount: sql<number>`${budgets.budgeted_amount}::numeric`,
      note: budgets.note,
      budget_year: budgets.budget_year,
      budget_month: budgets.budget_month,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.category_id, categories.id))
    .where(
      and(
        eq(budgets.user_id, userId),
        eq(budgets.budget_year, year),
        eq(budgets.budget_month, month)
      )
    )
    .orderBy(categories.group_name, categories.sort_order);
  return rows;
}

/** Budget + actual spending dari transactions (spending type saja) */
export async function getBudgetsWithSpending(
  userId: string,
  year: number,
  month: number,
  type: "spending" | "earning" = "spending"
): Promise<BudgetWithSpending[]> {
  const allRows = await getBudgets(userId, year, month);
  
  // Saving/investing are not expenses — their targets live on goals (getSavingBudgets).
  const rows = type === "earning"
    ? allRows.filter((r) => r.group_name === "earning")
    : allRows.filter((r) => !["earning", "saving", "investing"].includes(r.group_name));

  if (rows.length === 0) return [];

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const actualCategory = await db
    .select({
      category_id: transactions.category_id,
      total: sql<number>`sum(${transactions.amount})::numeric`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, type),
        // Goal-funded spending is paid from goal money, not the monthly budget (P1).
        type === "spending" ? isNull(transactions.goal_id) : undefined,
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`,
        inArray(
          transactions.category_id,
          rows.map((r) => r.category_id)
        )
      )
    )
    .groupBy(transactions.category_id);

  const actualMap = new Map(actualCategory.map((s) => [s.category_id, Number(s.total)]));

  return rows.map((r) => {
    const spent = actualMap.get(r.category_id) ?? 0;
    const percent = r.budgeted_amount > 0 ? (spent / r.budgeted_amount) * 100 : 0;
    return { ...r, actual_spending: spent, percent };
  });
}

/** Upsert satu budget (insert or update on conflict) */
export async function upsertBudget(
  userId: string,
  input: {
    category_id: string;
    budget_year: number;
    budget_month: number;
    budgeted_amount: number;
    note?: string | null;
  }
): Promise<string> {
  const result = await db
    .insert(budgets)
    .values({
      user_id: userId,
      category_id: input.category_id,
      budget_year: input.budget_year,
      budget_month: input.budget_month,
      budgeted_amount: String(input.budgeted_amount),
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [budgets.user_id, budgets.budget_year, budgets.budget_month, budgets.category_id],
      set: {
        budgeted_amount: sql`excluded.budgeted_amount`,
        note: sql`excluded.note`,
        updated_at: sql`now()`,
      },
    })
    .returning({ id: budgets.id });
  return result[0].id;
}

/** Hapus budget row */
export async function deleteBudget(userId: string, budgetId: string): Promise<void> {
  await db
    .delete(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.user_id, userId)));
}

export async function getTransactionsForWeeklyBudget(
  userId: string,
  year: number,
  month: number
): Promise<{ transaction_type: string; category_name: string; amount: number; transaction_date: string }[]> {
  // Extend range: prev month day 1 → next month last day (untuk edge case week 1 dan last week)
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const rows = await db
    .select({
      transaction_type: transactions.transaction_type,
      category_name: sql<string>`COALESCE(${categories.name}, '')`,
      amount: sql<number>`${transactions.amount}::numeric`,
      transaction_date: sql<string>`${transactions.transaction_date}::text`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category_id, categories.id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "spending"),
        isNull(transactions.goal_id),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`
      )
    );
  return rows;
}

/** Σ goal-funded spending in a month — shown as "Funded from goals" on /budgets (P8). */
export async function getGoalFundedSpending(
  userId: string,
  year: number,
  month: number
): Promise<number> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}::numeric), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "spending"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
      )
    );
  return Number(row?.total ?? 0);
}

export interface BudgetTxRow {
  id: string;
  transaction_date: string;
  note: string | null;
  amount: number;
  account_name: string;
}

export async function getTransactionsForBudget(
  userId: string,
  categoryId: string,
  year: number,
  month: number,
  type: "spending" | "earning" = "spending"
): Promise<BudgetTxRow[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  return db
    .select({
      id: transactions.id,
      transaction_date: sql<string>`${transactions.transaction_date}::text`,
      note: transactions.note,
      amount: sql<number>`${transactions.amount}::numeric`,
      account_name: sql<string>`COALESCE(${accounts.name}, '')`,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.account_id, accounts.id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.category_id, categoryId),
        eq(transactions.transaction_type, type),
        type === "spending" ? isNull(transactions.goal_id) : undefined,
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
      )
    )
    .orderBy(sql`${transactions.transaction_date} DESC`);
}
