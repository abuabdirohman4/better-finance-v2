import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, debts, transactions } from "@/db/schema";
import type { DebtDirection } from "@/lib/constants";
import {
  debtStatus,
  ledgerDirection,
  ledgerOwed,
  summarizeDebt,
  type DebtStatus,
  type LedgerTx,
} from "@/lib/debt";

export interface DebtRow {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  account_id: string;
  account_name: string;
  opening_amount: number;
  due_date: string | null;
  note: string | null;
  total: number;
  settled: number;
  outstanding: number;
  status: DebtStatus;
}

/** One ledger account (AR/AP/…) and how much of its balance is not yet split per counterparty. */
export interface LedgerRow {
  account_id: string;
  name: string;
  direction: DebtDirection;
  owed: number;      // ledger balance as amount owed (natural sign flipped for payables)
  untracked: number; // owed − Σ outstanding of active debts on this ledger
}

export interface DebtsSummary {
  debts: DebtRow[];
  ledgers: LedgerRow[];
}

/** Active (non-archived) debts with derived outstanding/status, plus ledger rows for the "Untracked" line. */
export async function getDebts(userId: string, today: string): Promise<DebtsSummary> {
  const [debtRows, txRows] = await Promise.all([
    db
      .select({
        id: debts.id,
        direction: debts.direction,
        counterparty: debts.counterparty,
        account_id: debts.account_id,
        account_name: accounts.name,
        opening_amount: debts.opening_amount,
        due_date: debts.due_date,
        note: debts.note,
      })
      .from(debts)
      .innerJoin(accounts, eq(accounts.id, debts.account_id))
      .where(and(eq(debts.user_id, userId), isNull(debts.archived_at)))
      .orderBy(asc(debts.created_at)),
    db
      .select({
        debt_id: transactions.debt_id,
        transaction_type: transactions.transaction_type,
        account_id: transactions.account_id,
        to_account_id: transactions.to_account_id,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.user_id, userId),
          isNotNull(transactions.debt_id),
          isNull(transactions.deleted_at)
        )
      ),
  ]);

  const txByDebt = new Map<string, LedgerTx[]>();
  for (const t of txRows) {
    const list = txByDebt.get(t.debt_id!) ?? [];
    list.push({
      transaction_type: t.transaction_type,
      account_id: t.account_id,
      to_account_id: t.to_account_id,
      amount: Number(t.amount),
    });
    txByDebt.set(t.debt_id!, list);
  }

  const rows: DebtRow[] = debtRows.map((d) => {
    const direction = d.direction as DebtDirection;
    const opening = Number(d.opening_amount);
    const totals = summarizeDebt(direction, opening, d.account_id, txByDebt.get(d.id) ?? []);
    return {
      ...d,
      direction,
      opening_amount: opening,
      ...totals,
      status: debtStatus(totals.outstanding, d.due_date, today),
    };
  });

  // Ledgers = the conventional AR/AP accounts + any account an active debt uses.
  const ledgerIds = [...new Set(rows.map((r) => r.account_id))];
  const ledgerAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      current_balance: sql<number>`${accounts.current_balance}::numeric`,
      is_liability: accounts.is_liability,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.user_id, userId),
        eq(accounts.is_active, true),
        ledgerIds.length > 0
          ? or(inArray(accounts.slug, ["ar", "ap"]), inArray(accounts.id, ledgerIds))
          : inArray(accounts.slug, ["ar", "ap"])
      )
    );

  const ledgers: LedgerRow[] = ledgerAccounts.map((a) => {
    const direction = ledgerDirection(a.is_liability);
    const owed = ledgerOwed(direction, Number(a.current_balance));
    const tracked = rows
      .filter((r) => r.account_id === a.id)
      .reduce((s, r) => s + r.outstanding, 0);
    return { account_id: a.id, name: a.name, direction, owed, untracked: owed - tracked };
  });

  return { debts: rows, ledgers };
}

export interface DebtRecord {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  account_id: string;
  archived_at: Date | null;
}

/** One debt owned by the user (archived included; callers decide). */
export async function getDebtById(userId: string, debtId: string): Promise<DebtRecord | null> {
  const [row] = await db
    .select({
      id: debts.id,
      direction: debts.direction,
      counterparty: debts.counterparty,
      account_id: debts.account_id,
      archived_at: debts.archived_at,
    })
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.user_id, userId)))
    .limit(1);
  return row ? { ...row, direction: row.direction as DebtDirection } : null;
}

export interface DebtSelectRow {
  id: string;
  counterparty: string;
  direction: DebtDirection;
  account_id: string;
}

/** Active debts for the "For debt" picker in TransactionForm. */
export async function getDebtsForSelect(userId: string): Promise<DebtSelectRow[]> {
  const rows = await db
    .select({
      id: debts.id,
      counterparty: debts.counterparty,
      direction: debts.direction,
      account_id: debts.account_id,
    })
    .from(debts)
    .where(and(eq(debts.user_id, userId), isNull(debts.archived_at)))
    .orderBy(asc(debts.counterparty));
  return rows.map((r) => ({ ...r, direction: r.direction as DebtDirection }));
}

export async function createDebt(
  userId: string,
  input: {
    direction: DebtDirection;
    counterparty: string;
    account_id: string;
    opening_amount: number;
    due_date: string | null;
    note: string | null;
  }
): Promise<string> {
  const [row] = await db
    .insert(debts)
    .values({
      user_id: userId,
      direction: input.direction,
      counterparty: input.counterparty,
      account_id: input.account_id,
      opening_amount: String(input.opening_amount),
      due_date: input.due_date,
      note: input.note,
    })
    .returning({ id: debts.id });
  return row.id;
}

export async function updateDebt(
  userId: string,
  debtId: string,
  input: Partial<{
    counterparty: string;
    opening_amount: number;
    due_date: string | null;
    note: string | null;
  }>
): Promise<void> {
  const set: Record<string, unknown> = { updated_at: sql`now()` };
  if (input.counterparty !== undefined) set.counterparty = input.counterparty;
  if (input.opening_amount !== undefined) set.opening_amount = String(input.opening_amount);
  if (input.due_date !== undefined) set.due_date = input.due_date;
  if (input.note !== undefined) set.note = input.note;
  await db
    .update(debts)
    .set(set)
    .where(and(eq(debts.id, debtId), eq(debts.user_id, userId)));
}

export async function archiveDebt(userId: string, debtId: string): Promise<void> {
  await db
    .update(debts)
    .set({ archived_at: sql`now()`, updated_at: sql`now()` })
    .where(and(eq(debts.id, debtId), eq(debts.user_id, userId)));
}
