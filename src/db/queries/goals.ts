import { and, eq, desc, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { savingsGoals, transactions, categories, accounts } from "@/db/schema";
import type { GoalAccountFlow } from "@/lib/goalReality";

export interface GoalRow {
  id: string;
  name: string;
  description: string | null;
  goal_type: string;
  target_amount: number;
  collected_amount: number;
  monthly_contribution: number | null;
  deadline_date: string | null;
  duration_label: string | null;
  is_active: boolean;
  percent: number; // collected / target * 100
}

export async function getGoals(userId: string): Promise<GoalRow[]> {
  // Sum transfers per goal in a grouped subquery, then LEFT JOIN — avoids a
  // correlated subquery whose `${savingsGoals.id}` renders unqualified `"id"`
  // and mis-binds to transactions.id inside the sub-select.
  const transfersByGoal = db
    .select({
      goal_id: transactions.goal_id,
      total: sql<number>`SUM(${transactions.amount}::numeric)`.as("total_transfers"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
      ),
    )
    .groupBy(transactions.goal_id)
    .as("transfers_by_goal");

  const withdrawalsByGoal = db
    .select({
      goal_id: transactions.goal_id,
      total: sql<number>`SUM(${transactions.amount}::numeric)`.as("total_withdrawals"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "spending"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
      ),
    )
    .groupBy(transactions.goal_id)
    .as("withdrawals_by_goal");

  const rows = await db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      description: savingsGoals.description,
      goal_type: savingsGoals.goal_type,
      target_amount: sql<number>`${savingsGoals.target_amount}::numeric`,
      collected_amount: sql<number>`${savingsGoals.collected_amount}::numeric + COALESCE(${transfersByGoal.total}, 0) - COALESCE(${withdrawalsByGoal.total}, 0)`,
      monthly_contribution: sql<number>`${savingsGoals.monthly_contribution}::numeric`,
      deadline_date: savingsGoals.deadline_date,
      duration_label: savingsGoals.duration_label,
      is_active: savingsGoals.is_active,
    })
    .from(savingsGoals)
    .leftJoin(transfersByGoal, eq(transfersByGoal.goal_id, savingsGoals.id))
    .leftJoin(withdrawalsByGoal, eq(withdrawalsByGoal.goal_id, savingsGoals.id))
    .where(and(eq(savingsGoals.user_id, userId), eq(savingsGoals.is_active, true)))
    .orderBy(savingsGoals.goal_type, desc(savingsGoals.collected_amount));

  return rows.map((r) => ({
    ...r,
    percent: r.target_amount > 0 ? (Math.max(0, r.collected_amount) / r.target_amount) * 100 : 0,
  }));
}

export interface GoalLedgerRow {
  id: string;
  transaction_date: string;
  transaction_type: "transfer" | "spending";
  amount: number;
  note: string | null;
  category_name: string | null;
}

export async function getGoalLedger(
  userId: string,
  goalId: string,
  period?: { year: number; month: number }
): Promise<GoalLedgerRow[]> {
  const startDate = period ? `${period.year}-${String(period.month).padStart(2, "0")}-01` : null;
  const endDate = period
    ? `${period.year}-${String(period.month).padStart(2, "0")}-${new Date(period.year, period.month, 0).getDate()}`
    : null;

  const rows = await db
    .select({
      id: transactions.id,
      transaction_date: transactions.transaction_date,
      transaction_type: transactions.transaction_type,
      amount: sql<number>`${transactions.amount}::numeric`,
      note: transactions.note,
      category_name: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.category_id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.goal_id, goalId),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_type} IN ('transfer', 'spending')`,
        startDate ? sql`${transactions.transaction_date} >= ${startDate}` : undefined,
        endDate ? sql`${transactions.transaction_date} <= ${endDate}` : undefined,
      ),
    )
    .orderBy(desc(transactions.transaction_date), desc(transactions.created_at));

  return rows.map(r => ({
    id: r.id,
    transaction_date: r.transaction_date,
    transaction_type: r.transaction_type as "transfer" | "spending",
    amount: Number(r.amount),
    note: r.note,
    category_name: r.category_name,
  }));
}

export interface SavingBudgetRow {
  goal_id: string;
  goal_name: string;
  goal_type: string;
  monthly_target: number;
  actual_saved: number;
  percent: number;
}

export async function getSavingBudgets(
  userId: string,
  year: number,
  month: number
): Promise<SavingBudgetRow[]> {
  const goals = await db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      goal_type: savingsGoals.goal_type,
      monthly_contribution: sql<number>`${savingsGoals.monthly_contribution}::numeric`,
    })
    .from(savingsGoals)
    .where(
      and(
        eq(savingsGoals.user_id, userId),
        eq(savingsGoals.is_active, true),
      )
    )
    .orderBy(savingsGoals.goal_type, savingsGoals.name);

  if (goals.length === 0) return [];

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const transfers = await db
    .select({
      goal_id: transactions.goal_id,
      total: sql<number>`SUM(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        isNotNull(transactions.goal_id),
        isNull(transactions.deleted_at),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        inArray(transactions.goal_id, goals.map(g => g.id)),
      )
    )
    .groupBy(transactions.goal_id);

  const transferMap = new Map(transfers.map(t => [t.goal_id, Number(t.total)]));

  return goals.map(g => {
    const actual = transferMap.get(g.id) ?? 0;
    const target = Number(g.monthly_contribution ?? 0);
    return {
      goal_id: g.id,
      goal_name: g.name,
      goal_type: g.goal_type,
      monthly_target: target,
      actual_saved: actual,
      percent: target > 0 ? (actual / target) * 100 : 0,
    };
  });
}

export async function createGoal(
  userId: string,
  input: {
    name: string;
    description?: string | null;
    goal_type: string;
    target_amount: number;
    monthly_contribution?: number | null;
    deadline_date?: string | null;
  }
): Promise<string> {
  const result = await db
    .insert(savingsGoals)
    .values({
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      goal_type: input.goal_type,
      target_amount: String(input.target_amount),
      monthly_contribution: input.monthly_contribution ? String(input.monthly_contribution) : null,
      deadline_date: input.deadline_date ?? null,
    })
    .returning({ id: savingsGoals.id });
  return result[0].id;
}

export async function updateGoal(
  userId: string,
  goalId: string,
  input: Partial<{
    name: string;
    description: string | null;
    goal_type: string;
    target_amount: number;
    monthly_contribution: number | null;
    deadline_date: string | null;
    collected_amount: number;
  }>
): Promise<void> {
  const set: Record<string, unknown> = { updated_at: sql`now()` };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.goal_type !== undefined) set.goal_type = input.goal_type;
  if (input.target_amount !== undefined) set.target_amount = String(input.target_amount);
  if (input.monthly_contribution !== undefined)
    set.monthly_contribution = input.monthly_contribution ? String(input.monthly_contribution) : null;
  if (input.deadline_date !== undefined) set.deadline_date = input.deadline_date;
  if (input.collected_amount !== undefined) set.collected_amount = String(input.collected_amount);

  await db
    .update(savingsGoals)
    .set(set)
    .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.user_id, userId)));
}

export async function softDeleteGoal(userId: string, goalId: string): Promise<void> {
  await db
    .update(savingsGoals)
    .set({ is_active: false, updated_at: sql`now()` })
    .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.user_id, userId)));
}

export interface GoalSelectRow {
  id: string;
  name: string;
  goal_type: string;
}

export async function getGoalsForSelect(userId: string): Promise<GoalSelectRow[]> {
  return db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      goal_type: savingsGoals.goal_type,
    })
    .from(savingsGoals)
    .where(and(eq(savingsGoals.user_id, userId), eq(savingsGoals.is_active, true)))
    .orderBy(savingsGoals.goal_type, savingsGoals.name);
}

// Sum of transfer amounts tagged to any active goal that landed in a liquid account.
// Used by affordability: this money still sits in the liquid pool and is earmarked.
export async function getLiquidGoalAllocated(userId: string, liquidAccountIds: string[]): Promise<number> {
  if (liquidAccountIds.length === 0) return 0;
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "transfer"),
        isNotNull(transactions.goal_id),
        inArray(transactions.to_account_id, liquidAccountIds),
        isNull(transactions.deleted_at),
      ),
    );
  return Number(row?.total ?? 0);
}

// Signed goal money per account (bf-kvk): + goal transfers landing in the account, − goal spending paid from it.
export async function getGoalFlowsByAccount(userId: string): Promise<GoalAccountFlow[]> {
  const common = and(
    eq(transactions.user_id, userId),
    isNull(transactions.deleted_at),
    isNotNull(transactions.goal_id),
  );
  const activeGoal = and(eq(savingsGoals.id, transactions.goal_id), eq(savingsGoals.is_active, true));

  const [inflows, outflows] = await Promise.all([
    db
      .select({
        account_id: accounts.id,
        account_name: accounts.name,
        current_balance: sql<number>`${accounts.current_balance}::numeric`,
        amount: sql<number>`SUM(${transactions.amount}::numeric)`,
      })
      .from(transactions)
      .innerJoin(savingsGoals, activeGoal)
      .innerJoin(accounts, and(eq(accounts.id, transactions.to_account_id), eq(accounts.user_id, userId)))
      .where(and(common, eq(transactions.transaction_type, "transfer")))
      .groupBy(accounts.id, accounts.name, accounts.current_balance),
    db
      .select({
        account_id: accounts.id,
        account_name: accounts.name,
        current_balance: sql<number>`${accounts.current_balance}::numeric`,
        amount: sql<number>`-SUM(${transactions.amount}::numeric)`,
      })
      .from(transactions)
      .innerJoin(savingsGoals, activeGoal)
      .innerJoin(accounts, and(eq(accounts.id, transactions.account_id), eq(accounts.user_id, userId)))
      .where(and(common, eq(transactions.transaction_type, "spending")))
      .groupBy(accounts.id, accounts.name, accounts.current_balance),
  ]);

  return [...inflows, ...outflows];
}
