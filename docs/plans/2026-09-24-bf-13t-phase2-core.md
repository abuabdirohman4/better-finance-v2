# bf-13t Phase 2: core (helpers, queries, actions, debt tagging, Net Worth sign)

**Date:** 2026-09-24 · **Issue:** bf-13t · **Design:** `docs/plans/2026-09-24-bf-13t-apar-design.md`
**Requires:** phase 1 merged (`debts` in `src/db/schema.ts`, `DebtDirection` in `src/lib/constants.ts`).
**Executor:** Sonnet (blind).

## Rules for the executor

- Do NOT run SQL, `build`, `test`, or `dev`. The owner runs `npm run test:run` + `npm run build`.
- Balance changes go ONLY through `applyTransactionBalancesRpc`. Never use `adjustAccountBalance`.
- Every query filters `user_id`. Every account a mutation touches gets `getAccountById(user.id, id)` first.
- zod messages stay literal English. Everything else user-facing goes through `t()`. Add each key to `en.json` AND `id.json` (a unit test checks the two files match).
- **Another plan (bf-btz / bf-yz4) lands BEFORE this one** and edits `TransactionForm.tsx` (the `goal_id:` submit line), `transactions/actions.ts` (the goal/earning guard), `TransactionBottomSheet.tsx` (`invalidateCaches` + the `@/lib/query` import) and budget queries. Every edit below is **additive** and anchored on lines that plan does not change. If an anchor isn't found verbatim, find the nearest equivalent line (named in each step), insert there, and mention it in your report. Do NOT revert anything that plan added.

## Model recap (from the design)

- `debts` = metadata. Money = ordinary transfers tagged `transactions.debt_id`, going in and out of the debt's **ledger** account (`debts.account_id`: AR, AP, credit card …).
- Ledger direction is decided by the account: `is_liability` → payable, otherwise receivable.
- Natural sign: a payable ledger is **negative** when you owe. `netWorth = Σ balances`.

| Event | Transfer | Ledger delta |
|---|---|---|
| Lend (receivable, increase) | cash → ledger | + |
| Collect (receivable, settle) | ledger → cash | − |
| Borrow (payable, increase) | ledger → cash | − |
| Repay (payable, settle) | cash → ledger | + |

## Files

| # | File | New / edit |
|---|---|---|
| 1 | `src/lib/debt.ts` | new: pure helpers |
| 2 | `src/lib/__tests__/debt.test.ts` | new: vitest |
| 3 | `src/lib/schemas/debt.ts` | new: zod |
| 4 | `src/db/queries/debts.ts` | new |
| 5 | `src/app/(app)/debts/actions.ts` | new: server actions |
| 6 | `src/lib/query.ts` | add `debtKeys` |
| 7 | `src/lib/schemas/transaction.ts` | add `debt_id` |
| 8 | `src/db/queries/transactions.ts` | add `debt_id` (row, select ×2, insert, update) |
| 9 | `src/app/(app)/transactions/actions.ts` | debt tag validation (create + update) |
| 10 | `src/app/(app)/transactions/_components/TransactionForm.tsx` | "For debt" picker |
| 11 | `src/app/(app)/transactions/_components/TransactionBottomSheet.tsx` | pass `debt_id`, invalidate `debtKeys` |
| 12 | `src/db/queries/assets.ts` | liability sign fix |
| 13 | `src/db/queries/accounts.ts` | dashboard total sign fix |
| 14 | `src/app/(app)/net-worth/page.tsx` | `LiabilityCard` shows the natural sign |
| 15 | `src/i18n/messages/en.json` + `id.json` | `transactions.*` debt keys + new `debts` namespace (server keys) |

---

## Step 1: `src/lib/debt.ts` (new)

```ts
import type { DebtDirection } from "@/lib/constants";

export type DebtStatus = "open" | "overdue" | "settled";
/** increase = lend more / borrow more; settle = collect / repay. */
export type DebtMovementKind = "increase" | "settle";

export interface LedgerTx {
  transaction_type: string;
  account_id: string;
  to_account_id: string | null;
  amount: number;
}

/** Signed effect of one transaction on the ledger balance (same rule as apply_transaction_balances). */
export function ledgerDelta(tx: LedgerTx, ledgerId: string): number {
  if (tx.transaction_type === "transfer" && tx.to_account_id === ledgerId) return tx.amount;
  if (tx.account_id !== ledgerId) return 0;
  return tx.transaction_type === "earning" ? tx.amount : -tx.amount;
}

export interface DebtTotals {
  total: number;       // opening + every increase
  settled: number;     // every payment / collection
  outstanding: number; // total − settled
}

export function summarizeDebt(
  direction: DebtDirection,
  openingAmount: number,
  ledgerId: string,
  txs: LedgerTx[]
): DebtTotals {
  let total = openingAmount;
  let settled = 0;
  for (const tx of txs) {
    const d = ledgerDelta(tx, ledgerId);
    const grows = direction === "receivable" ? d : -d; // > 0 = the debt grew
    if (grows > 0) total += grows;
    else settled -= grows;
  }
  return { total, settled, outstanding: total - settled };
}

/** today / dueDate are YYYY-MM-DD, so string compare is date compare. */
export function debtStatus(outstanding: number, dueDate: string | null, today: string): DebtStatus {
  if (Math.round(outstanding * 100) <= 0) return "settled";
  return dueDate && dueDate < today ? "overdue" : "open";
}

/** Lend and repay pay out of cash (cash → ledger); collect and borrow pay into cash (ledger → cash). */
export function movementLegs(
  direction: DebtDirection,
  kind: DebtMovementKind,
  ledgerId: string,
  cashId: string
): { account_id: string; to_account_id: string } {
  const cashPays = (direction === "receivable") === (kind === "increase");
  return cashPays
    ? { account_id: cashId, to_account_id: ledgerId }
    : { account_id: ledgerId, to_account_id: cashId };
}

export function ledgerDirection(isLiability: boolean): DebtDirection {
  return isLiability ? "payable" : "receivable";
}

/** Ledger balance as "amount owed" (positive = owed to me for AR, owed by me for AP). */
export function ledgerOwed(direction: DebtDirection, balance: number): number {
  return direction === "receivable" ? balance : -balance;
}

export type DebtTagError = "debtTransferOnly" | "debtGoalConflict" | "debtAccountMismatch";

/** A debt-tagged transaction must be a transfer that touches the debt's ledger and has no goal. */
export function checkDebtTag(
  tx: {
    transaction_type: string;
    account_id: string;
    to_account_id?: string | null;
    goal_id?: string | null;
  },
  ledgerId: string
): DebtTagError | null {
  if (tx.transaction_type !== "transfer") return "debtTransferOnly";
  if (tx.goal_id) return "debtGoalConflict";
  if (tx.account_id !== ledgerId && tx.to_account_id !== ledgerId) return "debtAccountMismatch";
  return null;
}
```

## Step 2: `src/lib/__tests__/debt.test.ts` (new)

```ts
import { describe, expect, it } from "vitest";
import {
  checkDebtTag,
  debtStatus,
  ledgerDelta,
  ledgerDirection,
  ledgerOwed,
  movementLegs,
  summarizeDebt,
} from "../debt";

const L = "ledger";
const C = "cash";
const transfer = (from: string, to: string, amount: number) => ({
  transaction_type: "transfer",
  account_id: from,
  to_account_id: to,
  amount,
});

describe("ledgerDelta", () => {
  it("follows the balance RPC rule", () => {
    expect(ledgerDelta(transfer(C, L, 100), L)).toBe(100);
    expect(ledgerDelta(transfer(L, C, 100), L)).toBe(-100);
    expect(ledgerDelta({ transaction_type: "spending", account_id: L, to_account_id: null, amount: 50 }, L)).toBe(-50);
    expect(ledgerDelta({ transaction_type: "earning", account_id: L, to_account_id: null, amount: 50 }, L)).toBe(50);
    expect(ledgerDelta({ transaction_type: "spending", account_id: C, to_account_id: null, amount: 50 }, L)).toBe(0);
  });
});

describe("summarizeDebt", () => {
  it("receivable: lend 1000, collect 400", () => {
    const r = summarizeDebt("receivable", 0, L, [transfer(C, L, 1000), transfer(L, C, 400)]);
    expect(r).toEqual({ total: 1000, settled: 400, outstanding: 600 });
  });

  it("payable: borrow 1000, repay 1000", () => {
    const r = summarizeDebt("payable", 0, L, [transfer(L, C, 1000), transfer(C, L, 1000)]);
    expect(r).toEqual({ total: 1000, settled: 1000, outstanding: 0 });
  });

  it("opening amount counts as already owed", () => {
    expect(summarizeDebt("receivable", 500, L, [transfer(L, C, 200)]).outstanding).toBe(300);
    expect(summarizeDebt("payable", 500, L, [transfer(C, L, 200)]).outstanding).toBe(300);
  });

  it("ignores tagged rows that do not touch the ledger (e.g. interest paid from cash)", () => {
    const interest = { transaction_type: "spending", account_id: C, to_account_id: null, amount: 30 };
    expect(summarizeDebt("payable", 0, L, [transfer(L, C, 1000), interest]).outstanding).toBe(1000);
  });
});

describe("debtStatus", () => {
  it("settled at or below zero, overdue past due date, else open", () => {
    expect(debtStatus(0, "2026-01-01", "2026-09-24")).toBe("settled");
    expect(debtStatus(0.001, null, "2026-09-24")).toBe("settled");
    expect(debtStatus(100, "2026-09-23", "2026-09-24")).toBe("overdue");
    expect(debtStatus(100, "2026-09-24", "2026-09-24")).toBe("open");
    expect(debtStatus(100, null, "2026-09-24")).toBe("open");
  });
});

describe("movementLegs", () => {
  it("maps the four events to the right transfer direction", () => {
    expect(movementLegs("receivable", "increase", L, C)).toEqual({ account_id: C, to_account_id: L }); // lend
    expect(movementLegs("receivable", "settle", L, C)).toEqual({ account_id: L, to_account_id: C });   // collect
    expect(movementLegs("payable", "increase", L, C)).toEqual({ account_id: L, to_account_id: C });    // borrow
    expect(movementLegs("payable", "settle", L, C)).toEqual({ account_id: C, to_account_id: L });      // repay
  });

  it("round-trips through summarizeDebt", () => {
    for (const direction of ["receivable", "payable"] as const) {
      const inc = movementLegs(direction, "increase", L, C);
      const set = movementLegs(direction, "settle", L, C);
      const txs = [
        { transaction_type: "transfer", ...inc, amount: 1000 },
        { transaction_type: "transfer", ...set, amount: 250 },
      ];
      expect(summarizeDebt(direction, 0, L, txs).outstanding).toBe(750);
    }
  });
});

describe("ledger helpers", () => {
  it("direction and owed amount follow is_liability + natural sign", () => {
    expect(ledgerDirection(true)).toBe("payable");
    expect(ledgerDirection(false)).toBe("receivable");
    expect(ledgerOwed("receivable", 473900)).toBe(473900);
    expect(ledgerOwed("payable", -1000)).toBe(1000);
  });
});

describe("checkDebtTag", () => {
  it("accepts a transfer touching the ledger, rejects the rest", () => {
    expect(checkDebtTag(transfer(C, L, 1), L)).toBeNull();
    expect(checkDebtTag(transfer(L, C, 1), L)).toBeNull();
    expect(checkDebtTag({ ...transfer(C, L, 1), transaction_type: "spending" }, L)).toBe("debtTransferOnly");
    expect(checkDebtTag({ ...transfer(C, L, 1), goal_id: "g" }, L)).toBe("debtGoalConflict");
    expect(checkDebtTag(transfer(C, "other", 1), L)).toBe("debtAccountMismatch");
  });
});
```

## Step 3: `src/lib/schemas/debt.ts` (new)

```ts
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format");

export const debtDirectionSchema = z.enum(["receivable", "payable"]);

export const createDebtSchema = z.object({
  direction: debtDirectionSchema,
  counterparty: z.string().trim().min(1, "Counterparty is required").max(100),
  account_id: z.string().uuid("Invalid account ID"), // ledger
  amount: z.number().positive("Amount must be greater than 0"),
  due_date: dateStr.optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
  // Set → money moves now (tagged transfer from/to this account). Null → amount is already in the ledger (opening_amount).
  cash_account_id: z.string().uuid("Invalid account ID").optional().nullable(),
  transaction_date: dateStr,
});

export const updateDebtSchema = z
  .object({
    counterparty: z.string().trim().min(1, "Counterparty is required").max(100),
    opening_amount: z.number().min(0, "Amount cannot be negative"),
    due_date: dateStr.nullable(),
    note: z.string().trim().max(200).nullable(),
  })
  .partial();

export const debtMovementSchema = z.object({
  debt_id: z.string().uuid("Invalid debt ID"),
  kind: z.enum(["increase", "settle"]),
  cash_account_id: z.string().uuid("Invalid account ID"),
  amount: z.number().positive("Amount must be greater than 0"),
  transaction_date: dateStr,
  note: z.string().trim().max(200).optional().nullable(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type DebtMovementInput = z.infer<typeof debtMovementSchema>;
```

## Step 4: `src/db/queries/debts.ts` (new)

```ts
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
```

## Step 5: `src/app/(app)/debts/actions.ts` (new)

`direction` and `account_id` are **immutable after create**. Changing them would reinterpret every tagged transfer. The update schema doesn't expose them.

```ts
"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import { getAccountById, applyTransactionBalancesRpc } from "@/db/queries/accounts";
import { createTransaction } from "@/db/queries/transactions";
import {
  getDebts,
  getDebtById,
  getDebtsForSelect,
  createDebt,
  updateDebt,
  archiveDebt,
  type DebtsSummary,
  type DebtSelectRow,
} from "@/db/queries/debts";
import {
  createDebtSchema,
  updateDebtSchema,
  debtMovementSchema,
  type CreateDebtInput,
  type UpdateDebtInput,
  type DebtMovementInput,
} from "@/lib/schemas/debt";
import { ledgerDirection, movementLegs, type DebtMovementKind } from "@/lib/debt";
import type { DebtDirection } from "@/lib/constants";

// ponytail: server UTC date; overdue can flip up to 7h late for Asia/Jakarta. Use user_profiles.timezone if it matters.
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tagged transfer + atomic balance move. Callers MUST validate ownership of both accounts first. */
async function insertDebtTransfer(
  userId: string,
  debt: { id: string; direction: DebtDirection; account_id: string },
  kind: DebtMovementKind,
  cashAccountId: string,
  amount: number,
  date: string,
  note: string
): Promise<void> {
  const legs = movementLegs(debt.direction, kind, debt.account_id, cashAccountId);
  await createTransaction(userId, {
    transaction_type: "transfer",
    account_id: legs.account_id,
    to_account_id: legs.to_account_id,
    amount,
    note,
    transaction_date: date,
    category_id: null,
    goal_id: null,
    debt_id: debt.id,
  });
  await applyTransactionBalancesRpc(userId, [
    { account_id: legs.account_id, delta: -amount },
    { account_id: legs.to_account_id, delta: amount },
  ]);
}

export async function getDebtsAction(): Promise<ServerActionResult<DebtsSummary>> {
  try {
    const user = await requireUser();
    const data = await getDebts(user.id, todayStr());
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function getDebtsForSelectAction(): Promise<ServerActionResult<DebtSelectRow[]>> {
  try {
    const user = await requireUser();
    const data = await getDebtsForSelect(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function createDebtAction(
  input: CreateDebtInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const t = await getTranslations("debts");

    const parsed = createDebtSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
    const d = parsed.data;

    // Ledger: owned, and its liability flag must match the direction (AR for receivable, AP for payable).
    const ledger = await getAccountById(user.id, d.account_id);
    if (!ledger) return { success: false, message: t("ledgerNotFound") };
    if (ledgerDirection(ledger.is_liability) !== d.direction) {
      return { success: false, message: t("ledgerDirectionMismatch") };
    }

    if (d.cash_account_id) {
      if (d.cash_account_id === d.account_id) return { success: false, message: t("sameAccount") };
      const cash = await getAccountById(user.id, d.cash_account_id);
      if (!cash) return { success: false, message: t("cashNotFound") };
    }

    // Money moves now → outstanding comes from the tagged transfer. Otherwise the amount is already in the ledger.
    // ponytail: debt insert + transfer are not one DB transaction (same as createTransactionAction); a failed
    // transfer leaves a debt with 0 outstanding the user can archive.
    const id = await createDebt(user.id, {
      direction: d.direction,
      counterparty: d.counterparty,
      account_id: d.account_id,
      opening_amount: d.cash_account_id ? 0 : d.amount,
      due_date: d.due_date ?? null,
      note: d.note || null,
    });

    if (d.cash_account_id) {
      await insertDebtTransfer(
        user.id,
        { id, direction: d.direction, account_id: d.account_id },
        "increase",
        d.cash_account_id,
        d.amount,
        d.transaction_date,
        d.note || t("movementNote", { counterparty: d.counterparty })
      );
    }

    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}

export async function updateDebtAction(
  debtId: string,
  input: UpdateDebtInput
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const t = await getTranslations("debts");
    if (!z.string().uuid().safeParse(debtId).success) return { success: false, message: t("invalidId") };

    const parsed = updateDebtSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };

    const debt = await getDebtById(user.id, debtId);
    if (!debt) return { success: false, message: t("notFound") };

    await updateDebt(user.id, debtId, parsed.data);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}

/** Hide from the list. Tagged transactions stay; any remaining balance shows up as "Untracked". */
export async function archiveDebtAction(debtId: string): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const t = await getTranslations("debts");
    if (!z.string().uuid().safeParse(debtId).success) return { success: false, message: t("invalidId") };

    const debt = await getDebtById(user.id, debtId);
    if (!debt) return { success: false, message: t("notFound") };

    await archiveDebt(user.id, debtId);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}

/** Collect / repay / lend more / borrow more = one tagged transfer between cash and the ledger. */
export async function recordDebtMovementAction(
  input: DebtMovementInput
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const t = await getTranslations("debts");

    const parsed = debtMovementSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
    const m = parsed.data;

    const debt = await getDebtById(user.id, m.debt_id);
    if (!debt || debt.archived_at) return { success: false, message: t("notFound") };

    if (m.cash_account_id === debt.account_id) return { success: false, message: t("sameAccount") };
    const ledger = await getAccountById(user.id, debt.account_id);
    if (!ledger) return { success: false, message: t("ledgerNotFound") };
    const cash = await getAccountById(user.id, m.cash_account_id);
    if (!cash) return { success: false, message: t("cashNotFound") };

    await insertDebtTransfer(
      user.id,
      debt,
      m.kind,
      m.cash_account_id,
      m.amount,
      m.transaction_date,
      m.note || t("movementNote", { counterparty: debt.counterparty })
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}
```

## Step 6: `src/lib/query.ts`

Add after the `goalKeys` block:

```ts
export const debtKeys = {
  all: ["debts"] as const,
  list: () => [...debtKeys.all, "list"] as const,
  forSelect: () => [...debtKeys.all, "for-select"] as const,
};
```

## Step 7: `src/lib/schemas/transaction.ts`

Before (in `createTransactionSchema`):
```ts
  goal_id: z.string().uuid().optional().nullable(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
```
After:
```ts
  goal_id: z.string().uuid().optional().nullable(),
  debt_id: z.string().uuid().optional().nullable(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
```

Before (in `updateTransactionSchema` `.extend({...})`):
```ts
  goal_id: z.string().uuid().optional().nullable(),
});
```
After:
```ts
  goal_id: z.string().uuid().optional().nullable(),
  debt_id: z.string().uuid().optional().nullable(),
});
```

## Step 8: `src/db/queries/transactions.ts`

1. `TransactionRow` interface: after `goal_id: string | null;` add `debt_id: string | null;`
2. Both select objects (`getTransactions` and `getTransactionById`) contain `goal_id: transactions.goal_id,`. After **each** of them add `debt_id: transactions.debt_id,` (2 places).
3. `createTransaction` values: after `goal_id: input.goal_id ?? null,` add `debt_id: input.debt_id ?? null,`
4. `updateTransaction`: after `if ("goal_id" in input) values.goal_id = input.goal_id ?? null;` add
   `if ("debt_id" in input) values.debt_id = input.debt_id ?? null;`

## Step 9: `src/app/(app)/transactions/actions.ts`

### 9a. Imports: add below the `getGoalsForSelect` import
```ts
import { getDebtById } from "@/db/queries/debts";
import { checkDebtTag } from "@/lib/debt";
```

### 9b. `createTransactionAction`: insert **immediately before** `const id = await createTransaction(user.id, validInput);`

(Anchor is stable. bf-btz's earning+goal guard sits above it, so leave that alone.)
```ts
    if (validInput.debt_id) {
      const debt = await getDebtById(user.id, validInput.debt_id);
      if (!debt) return { success: false, message: (await getTranslations("transactions"))("debtNotFound") };
      const tagError = checkDebtTag(validInput, debt.account_id);
      if (tagError) return { success: false, message: (await getTranslations("transactions"))(tagError) };
    }
```

### 9c. `updateTransactionAction`: insert **immediately before** the comment `// All balance adjustments atomic via Postgres RPC`

(Fallback anchor if the comment moved: immediately before `const adjustments = calcUpdateDeltas(`.)
```ts
    // Debt tag must still fit the edited transaction (type/accounts may have changed).
    const newDebtId = "debt_id" in validInput ? validInput.debt_id : old.debt_id;
    if (newDebtId) {
      const debt = await getDebtById(user.id, newDebtId);
      if (!debt) return { success: false, message: (await getTranslations("transactions"))("debtNotFound") };
      const tagError = checkDebtTag(
        {
          transaction_type: newType,
          account_id: newAccountId,
          to_account_id: newToAccountId ?? null,
          goal_id: "goal_id" in validInput ? validInput.goal_id : old.goal_id,
        },
        debt.account_id
      );
      if (tagError) return { success: false, message: (await getTranslations("transactions"))(tagError) };
    }
```
(`newType`, `newAccountId`, `newToAccountId` are already defined above in that function. `deleteTransactionAction` needs no change: a soft-deleted row drops out of `getDebts` automatically.)

## Step 10: `src/app/(app)/transactions/_components/TransactionForm.tsx`

### 10a. Imports
- Change `import { transactionKeys } from "@/lib/query";` to `import { transactionKeys, debtKeys } from "@/lib/query";` (if bf-btz changed this import, just add `debtKeys` to it).
- Add below `import { getGoalsForTransferAction } from "../actions";`:
```ts
import { getDebtsForSelectAction } from "@/app/(app)/debts/actions";
```

### 10b. `initialValues` type: after `goal_id?: string | null;` add
```ts
    debt_id?: string | null;
```

### 10c. State: after `const [goalId, setGoalId] = useState(init?.goal_id ?? "");` add
```ts
  const [debtId, setDebtId] = useState(init?.debt_id ?? "");
```

### 10d. Query + options: insert **after** the line `const goalOptions = goalsForTransfer.map((g) => ({ value: g.id, label: g.name }));`
```ts
  const { data: debtsRes } = useQuery({
    queryKey: debtKeys.forSelect(),
    queryFn: async () => getDebtsForSelectAction(),
    enabled: txType === "transfer",
  });
  // Only debts whose ledger is one side of this transfer can be tagged (server re-checks).
  const debtOptions = ((debtsRes?.success ? debtsRes.data : []) ?? [])
    .filter((d) => d.account_id === accountId || d.account_id === toAccountId)
    .map((d) => ({ value: d.id, label: d.counterparty }));
```

### 10e. Submit: in `submitData`, insert **after** the line `category_id: txType !== "transfer" ? categoryId || null : null,`
```ts
      // Picker not loaded yet → keep the existing tag instead of silently clearing it.
      debt_id:
        txType !== "transfer"
          ? null
          : debtsRes
            ? debtOptions.some((o) => o.value === debtId) ? debtId : null
            : debtId || null,
```

### 10f. JSX: insert **immediately before** `{/* Row 2: Catatan + Jumlah */}`
```tsx
      {/* Untuk Debt — opsional, hanya transfer yang menyentuh akun ledger (AR/AP) */}
      {txType === "transfer" && debtOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t("forDebt")} <span className="text-gray-400 text-xs">{t("optional")}</span>
          </label>
          <SingleSelect
            options={debtOptions}
            value={debtId}
            onChange={setDebtId}
            placeholder={t("noDebt")}
            searchable
            direction="up"
          />
        </div>
      )}
```

If the user picks both a goal and a debt, the server rejects it with `debtGoalConflict`. That's intended, so don't auto-clear either field.

## Step 11: `src/app/(app)/transactions/_components/TransactionBottomSheet.tsx`

1. Add `debtKeys` to the existing `@/lib/query` import (whatever else it already imports).
2. In `invalidateCaches()`, after `queryClient.invalidateQueries({ queryKey: goalKeys.all });` add:
```ts
    queryClient.invalidateQueries({ queryKey: debtKeys.all });
```
3. In the `initialValues={editTx ? {...}` object, after `goal_id: editTx.goal_id,` add:
```ts
              debt_id: editTx.debt_id,
```

## Step 12: `src/db/queries/assets.ts` (sign fix, decision D7)

Liability balances now use the natural sign (negative = owed). `totalLiabilities` stays a **positive "owed" number** for display, and `netWorth` becomes a plain sum of balances.

Before:
```ts
  const totalLiabilities = liabilityRows.reduce((s, r) => s + Number(r.current_balance), 0);
```
After:
```ts
  // Natural sign (bf-13t): liability balance is negative when owed → flip for a positive "owed" total.
  const totalLiabilities = -liabilityRows.reduce((s, r) => s + Number(r.current_balance), 0);
```
Leave `netWorth: totalLiquid + totalNonLiquid - totalLiabilities,` **unchanged**. With the flipped total it equals `Σ current_balance`.

Update the interface comment. Before:
```ts
  totalLiabilities: number;
```
After:
```ts
  totalLiabilities: number; // positive = owed (−Σ liability balances, natural sign)
```

## Step 13: `src/db/queries/accounts.ts` (dashboard total)

Before:
```ts
    .reduce((sum, a) => sum + (a.is_liability ? -a.current_balance : a.current_balance), 0);
```
After:
```ts
    .reduce((sum, a) => sum + a.current_balance, 0); // natural sign: liabilities already negative (bf-13t)
```

## Step 14: `src/app/(app)/net-worth/page.tsx`: `LiabilityCard`

Before:
```tsx
          -{hideBalances ? MASK : formatCurrency(asset.current_balance)}
```
After:
```tsx
          {hideBalances ? MASK : formatCurrency(asset.current_balance)}
```
(`formatCurrency` already prints `-Rp …` for negatives.) Leave the section total line `-{hideBalances ? MASK : formatCurrency(totalLiabilities)}` unchanged, because `totalLiabilities` is positive-owed.

## Step 15: i18n

### `src/i18n/messages/en.json`

In the `transactions` object, add (anywhere inside it, e.g. after `"noGoal"`):
```json
    "forDebt": "For Debt",
    "noDebt": "No debt",
    "debtNotFound": "Debt not found or does not belong to you.",
    "debtTransferOnly": "Only transfers can be linked to a debt.",
    "debtGoalConflict": "A transaction can be linked to a goal or a debt, not both.",
    "debtAccountMismatch": "The transfer must go to or from the debt's ledger account."
```

Add a new top-level `debts` namespace (phase 3 extends it with UI keys):
```json
  "debts": {
    "invalidId": "Invalid debt ID.",
    "notFound": "Debt not found.",
    "ledgerNotFound": "Ledger account not found.",
    "cashNotFound": "Cash account not found.",
    "sameAccount": "The cash account and the ledger account must be different.",
    "ledgerDirectionMismatch": "Receivables need a normal account (e.g. AR); payables need a liability account (e.g. AP).",
    "movementNote": "Debt: {counterparty}"
  }
```

### `src/i18n/messages/id.json`: same keys

`transactions`:
```json
    "forDebt": "Untuk Utang/Piutang",
    "noDebt": "Tanpa utang/piutang",
    "debtNotFound": "Utang/piutang tidak ditemukan atau bukan milikmu.",
    "debtTransferOnly": "Hanya transfer yang bisa dikaitkan ke utang/piutang.",
    "debtGoalConflict": "Transaksi hanya bisa dikaitkan ke goal atau utang/piutang, tidak keduanya.",
    "debtAccountMismatch": "Transfer harus masuk ke atau keluar dari akun ledger utang/piutang ini."
```
`debts`:
```json
  "debts": {
    "invalidId": "ID utang/piutang tidak valid.",
    "notFound": "Utang/piutang tidak ditemukan.",
    "ledgerNotFound": "Akun ledger tidak ditemukan.",
    "cashNotFound": "Akun kas tidak ditemukan.",
    "sameAccount": "Akun kas dan akun ledger harus berbeda.",
    "ledgerDirectionMismatch": "Piutang butuh akun biasa (mis. AR); utang butuh akun liabilitas (mis. AP).",
    "movementNote": "Utang/piutang: {counterparty}"
  }
```

## Verification (owner runs)

```bash
npm run test:run   # debt.test.ts + messages.test.ts (en/id key parity) must pass
npm run build      # catches typo'd t() keys and Drizzle column names
```
Manual check after the orchestrator applies phase 1 SQL:
1. `/net-worth`: total unchanged versus before (AP = 0, AR only moved bucket).
2. Transfer Wallet → AR 100.000 (no debt yet): the "For Debt" field stays hidden (no debts exist). Delete that tx afterwards.

## Out of scope here
The debts page, hooks, sheets, nav link and docs are all phase 3. Write-off / interest forms are later (design §6).
