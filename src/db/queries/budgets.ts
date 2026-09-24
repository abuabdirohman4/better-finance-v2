import { and, eq, inArray, sql, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, transactions, accounts, savingsGoals } from "@/db/schema";

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
  
  const rows = type === "earning"
    ? allRows.filter((r) => r.group_name === "earning")
    : allRows.filter((r) => r.group_name !== "earning");

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

  const actualGoal = await db
    .select({
      goal_type: savingsGoals.goal_type,
      total: sql<number>`sum(${transactions.amount})::numeric`,
    })
    .from(transactions)
    .innerJoin(savingsGoals, eq(transactions.goal_id, savingsGoals.id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
      )
    )
    .groupBy(savingsGoals.goal_type);

  const actualMap = new Map(actualCategory.map((s) => [s.category_id, Number(s.total)]));
  const goalMap = new Map(
    actualGoal.map((g) => [g.goal_type === "Saving" ? "saving" : "investing", Number(g.total)])
  );

  return rows.map((r) => {
    let spent = actualMap.get(r.category_id) ?? 0;
    if (r.group_name === "saving" || r.group_name === "investing") {
      spent += goalMap.get(r.group_name) ?? 0;
    }
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

export async function getTransactionsForTransfer(
  userId: string,
  type: "saving" | "investing",
  year: number,
  month: number
): Promise<BudgetTxRow[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const goalType = type === "saving" ? "Saving" : "Investment";

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
    .innerJoin(savingsGoals, eq(transactions.goal_id, savingsGoals.id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        eq(savingsGoals.goal_type, goalType),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
      )
    )
    .orderBy(sql`${transactions.transaction_date} DESC`);
}

export interface TransferBudgetRow {
  type: "saving" | "investing";
  label: string;
  category_id: string;
  budgeted_amount: number;
  actual_amount: number;
  percent: number;
}

export async function getTransferBudgets(
  userId: string,
  year: number,
  month: number
): Promise<TransferBudgetRow[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  // Budget targets from budgets table (Saving + Investing categories)
  const budgetRows = await db
    .select({
      group_name: categories.group_name,
      category_id: budgets.category_id,
      budgeted_amount: sql<number>`${budgets.budgeted_amount}::numeric`,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.category_id, categories.id))
    .where(
      and(
        eq(budgets.user_id, userId),
        eq(budgets.budget_year, year),
        eq(budgets.budget_month, month),
        inArray(categories.group_name, ["saving", "investing"]),
      )
    );

  const budgetMap = new Map(budgetRows.map(r => [r.group_name, r]));

  // Category IDs for Saving + Investing
  const catRows = await db
    .select({ id: categories.id, group_name: categories.group_name })
    .from(categories)
    .where(
      and(
        eq(categories.user_id, userId),
        inArray(categories.group_name, ["saving", "investing"]),
        eq(categories.is_active, true),
      )
    );
  const catMap = new Map(catRows.map(r => [r.group_name, r.id]));

  // Actual: SUM transfers grouped by goal_type
  const transferActual = await db
    .select({
      goal_type: savingsGoals.goal_type,
      total: sql<number>`SUM(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .innerJoin(savingsGoals, eq(transactions.goal_id, savingsGoals.id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
      )
    )
    .groupBy(savingsGoals.goal_type);

  // goal_type "Saving" → "saving", goal_type "Investment" → "investing"
  const actualMap = new Map(
    transferActual.map(r => [
      r.goal_type === "Saving" ? "saving" : "investing",
      Number(r.total),
    ])
  );

  const BUCKETS: { type: "saving" | "investing"; label: string; groupName: string }[] = [
    { type: "saving", label: "Saving", groupName: "saving" },
    { type: "investing", label: "Investing", groupName: "investing" },
  ];

  return BUCKETS.map(({ type, label, groupName }) => {
    const budgeted = budgetMap.get(groupName)?.budgeted_amount ?? 0;
    const actual = actualMap.get(type) ?? 0;
    return {
      type,
      label,
      category_id: catMap.get(groupName) ?? "",
      budgeted_amount: budgeted,
      actual_amount: actual,
      percent: budgeted > 0 ? (actual / budgeted) * 100 : 0,
    };
  });
}
