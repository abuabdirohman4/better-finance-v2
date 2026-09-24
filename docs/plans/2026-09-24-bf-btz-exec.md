# bf-btz — Goal-funded spending (exec plan, 1 of 2)

**Date:** 2026-09-24 · **Design:** `docs/plans/2026-09-24-budget-goal-trio-design.md` (P1–P8, T1–T8 APPROVED)
**Executor:** Sonnet, blind. **Next:** `2026-09-24-bf-yz4-exec.md` (runs AFTER this one, same `budgets.ts`).

## Rules for the executor

- Do ONLY the steps below. Every "BEFORE" snippet was verified against `main` @ `2099e5b`. If a BEFORE
  snippet does not match the file exactly, STOP and report — do not improvise.
- **Do NOT apply the migration** (Step 12). Only create the file. Orchestrator applies it after owner approval.
- Do NOT touch the DB, do NOT run `npm run build` / `test` / `dev` (owner runs them). Do NOT commit.
- All user-facing strings go through `t()`. Add keys to **both** `en.json` and `id.json` (test enforces identical keys).
- Keep changes local: a later plan (bf-13t) adds `transactions.debt_id` to `TransactionForm` + `transactions/actions.ts`.
  Do not restructure those files beyond the lines named here.

## Model (the one rule)

| Transaction | Effect |
|---|---|
| `transfer` + `goal_id` | goal contribution (+collected). Unchanged. |
| `spending` + `goal_id` | goal withdrawal (−collected, already in `getGoals`). **Excluded** from expense budget, drill-down, weekly. Shown as "Funded from goals" on `/budgets`. |
| `earning` + `goal_id` | **rejected by server** |

`getGoals` already computes `base + Σtransfer − Σspending` (`src/db/queries/goals.ts:40-64`) — no change there.

## Files (13)

| # | File | Change |
|---|---|---|
| 1 | `src/app/(app)/transactions/_lib/goalRule.ts` | NEW — `goalAllowed(type)` |
| 2 | `src/app/(app)/transactions/__tests__/goalRule.test.ts` | NEW — unit test |
| 3 | `src/app/(app)/transactions/_components/TransactionForm.tsx` | persist goal_id for spending (bug) + reset goal on type switch |
| 4 | `src/app/(app)/transactions/actions.ts` | reject goal_id on earning (create + update) |
| 5 | `src/db/queries/budgets.ts` | `isNull(goal_id)` in 3 spending queries + new `getGoalFundedSpending` |
| 6 | `src/app/(app)/budgets/actions.ts` | new `getGoalFundedSpendingAction` |
| 7 | `src/lib/query.ts` | `budgetKeys.goalFunded` |
| 8 | `src/app/(app)/budgets/_hooks/useBudgets.ts` | `fundedQuery` |
| 9 | `src/app/(app)/budgets/page.tsx` | "Funded from goals" line in Overall card (P8) |
| 10 | cache keys: `TransactionBottomSheet.tsx`, `GoalLedger.tsx`, `BudgetDrillSheet.tsx`, `weekly/_hooks/useWeeklyBudget.ts` | invalidation gaps |
| 11 | `src/app/(app)/goals/_components/GoalCard.tsx` | i18n history toggle + overspend warning (P6) |
| 12 | `supabase/migrations/20260924_budget_period_goal_account.sql` | NEW — drift fix, **not applied** |
| 13 | `src/i18n/messages/en.json`, `id.json`, `AGENTS.md` | keys + doc fix |

---

## Step 1 — pure rule `goalAllowed`

Create `src/app/(app)/transactions/_lib/goalRule.ts`:

```ts
// goal_id only means something on spending (withdrawal) or transfer (contribution); earning + goal is rejected.
export function goalAllowed(type: string): boolean {
  return type === "spending" || type === "transfer";
}
```

## Step 2 — test

Create `src/app/(app)/transactions/__tests__/goalRule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { goalAllowed } from "../_lib/goalRule";

describe("goalAllowed", () => {
  it("allows spending and transfer", () => {
    expect(goalAllowed("spending")).toBe(true);
    expect(goalAllowed("transfer")).toBe(true);
  });
  it("rejects earning and unknown types", () => {
    expect(goalAllowed("earning")).toBe(false);
    expect(goalAllowed("")).toBe(false);
  });
});
```

## Step 3 — `TransactionForm.tsx` (THE bug)

File: `src/app/(app)/transactions/_components/TransactionForm.tsx`

3a. Add import after line 13 (`import { getGoalsForTransferAction } from "../actions";`):

```ts
import { goalAllowed } from "../_lib/goalRule";
```

3b. Line 130 — BEFORE:

```ts
      goal_id: txType === "transfer" ? goalId || null : null,
```

AFTER:

```ts
      goal_id: goalAllowed(txType) ? goalId || null : null,
```

3c. Type pill onClick (lines 146-149) — reset goal too, so switching transfer↔spending never silently flips a
contribution into a withdrawal. BEFORE:

```tsx
            onClick={() => {
              setTxType(t);
              setCategoryId("");
            }}
```

AFTER:

```tsx
            onClick={() => {
              setTxType(t);
              setCategoryId("");
              setGoalId("");
            }}
```

Nothing else in this file changes (label `forGoal`/`fromGoal` already switches by type).

## Step 4 — server guard in `transactions/actions.ts`

File: `src/app/(app)/transactions/actions.ts`

4a. Add import after line 19 (`import { calcUpdateDeltas } from "./_lib/balanceDelta";`):

```ts
import { goalAllowed } from "./_lib/goalRule";
```

4b. `createTransactionAction` — lines 78-83 BEFORE:

```ts
    if (validInput.goal_id) {
      const goals = await getGoalsForSelect(user.id);
```

AFTER (insert the guard first; keep the ownership block unchanged):

```ts
    if (validInput.goal_id && !goalAllowed(validInput.transaction_type)) {
      return { success: false, message: (await getTranslations("transactions"))("goalNotAllowed") };
    }
    if (validInput.goal_id) {
      const goals = await getGoalsForSelect(user.id);
```

4c. `updateTransactionAction` — lines 138-139 BEFORE:

```ts
    const newGoalId = "goal_id" in validInput ? validInput.goal_id : old.goal_id;
    if (newGoalId && newGoalId !== old.goal_id) {
```

AFTER (effective type × effective goal — also catches "edit spending→earning but goal_id omitted"):

```ts
    const newGoalId = "goal_id" in validInput ? validInput.goal_id : old.goal_id;
    if (newGoalId && !goalAllowed(newType)) {
      return { success: false, message: (await getTranslations("transactions"))("goalNotAllowed") };
    }
    if (newGoalId && newGoalId !== old.goal_id) {
```

Ownership of goal: already enforced (create: always; update: when goal changes) via `getGoalsForSelect(user.id)`
which filters `user_id` + `is_active`. No change needed.

## Step 5 — `src/db/queries/budgets.ts`

5a. `getBudgetsWithSpending`, the `actualCategory` where-clause (lines 78-88). BEFORE:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, type),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`,
        inArray(
```

AFTER:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, type),
        // Goal-funded spending is paid from goal money, not the monthly budget (P1).
        type === "spending" ? isNull(transactions.goal_id) : undefined,
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`,
        inArray(
```

(`and()` from drizzle skips `undefined`.)

5b. `getTransactionsForWeeklyBudget` (lines 186-190). BEFORE:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "spending"),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`
      )
```

AFTER:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.transaction_type, "spending"),
        isNull(transactions.goal_id),
        sql`${transactions.transaction_date} >= ${startDate}`,
        sql`${transactions.transaction_date} <= ${endDate}`,
        sql`${transactions.deleted_at} is null`
      )
```

5c. `getTransactionsForBudget` (lines 226-229). BEFORE:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.category_id, categoryId),
        eq(transactions.transaction_type, type),
        isNull(transactions.deleted_at),
```

AFTER:

```ts
        eq(transactions.user_id, userId),
        eq(transactions.category_id, categoryId),
        eq(transactions.transaction_type, type),
        type === "spending" ? isNull(transactions.goal_id) : undefined,
        isNull(transactions.deleted_at),
```

5d. Add a new function directly AFTER `getTransactionsForWeeklyBudget` (after its closing `}` at line 194):

```ts
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
```

Imports at line 1 already include `isNull, isNotNull` — no change.

Do NOT touch `actualGoal` / `goalMap` / `getTransferBudgets` / `getTransactionsForTransfer` — plan 2 deletes them.

## Step 6 — `src/app/(app)/budgets/actions.ts`

6a. Import block lines 5-16: add `getGoalFundedSpending,` after `getTransferBudgets,` (line 12):

```ts
  getTransferBudgets,
  getGoalFundedSpending,
```

6b. Add after `getTransferBudgetsAction` (after line 67):

```ts
export async function getGoalFundedSpendingAction(
  year: number,
  month: number
): Promise<ServerActionResult<number>> {
  try {
    const user = await requireUser();
    const data = await getGoalFundedSpending(user.id, year, month);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}
```

## Step 7 — `src/lib/query.ts`

`budgetKeys` (lines 36-45). BEFORE:

```ts
  saving: (year: number, month: number) => 
    [...budgetKeys.all, "saving", year, month] as const,
};
```

AFTER:

```ts
  saving: (year: number, month: number) => 
    [...budgetKeys.all, "saving", year, month] as const,
  goalFunded: (year: number, month: number) =>
    [...budgetKeys.all, "goal-funded", year, month] as const,
};
```

## Step 8 — `src/app/(app)/budgets/_hooks/useBudgets.ts`

8a. Import (lines 5-12): add `getGoalFundedSpendingAction,` after `getTransferBudgetsAction,`.

8b. Add after the `transferQuery` block (after line 46):

```ts
  const fundedQuery = useQuery({
    queryKey: budgetKeys.goalFunded(year, month),
    queryFn: async () => {
      const res = await getGoalFundedSpendingAction(year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });
```

8c. Return object (lines 71-78): add `fundedQuery,` after `transferQuery,`.

## Step 9 — `src/app/(app)/budgets/page.tsx` (P8)

9a. Line 30 BEFORE:

```ts
  const { query, incomeQuery, transferQuery, categoriesQuery, upsertMutation, deleteMutation } = useBudgets(year, month);
```

AFTER:

```ts
  const { query, incomeQuery, transferQuery, fundedQuery, categoriesQuery, upsertMutation, deleteMutation } = useBudgets(year, month);
  const fundedFromGoals = fundedQuery.data ?? 0;
```

9b. Overall card — after the progress-bar block that ends at line 171 (`</div>` closing `flex items-center gap-3`),
i.e. BEFORE:

```tsx
            <span className="text-xs font-semibold text-green-600">{overallPercent.toFixed(0)}%</span>
          </div>
        </div>
```

AFTER:

```tsx
            <span className="text-xs font-semibold text-green-600">{overallPercent.toFixed(0)}%</span>
          </div>
          {fundedFromGoals > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              {t("fundedFromGoals")}:{" "}
              <span className="font-semibold text-gray-700">
                {hideBalances ? MASK : formatCurrency(fundedFromGoals, "short")}
              </span>
            </p>
          )}
        </div>
```

## Step 10 — cache invalidation gaps (T4)

10a. `src/app/(app)/transactions/_components/TransactionBottomSheet.tsx`
- Line 8 BEFORE: `import { transactionKeys, accountKeys, dashboardKeys, goalKeys } from "@/lib/query";`
  AFTER: `import { transactionKeys, accountKeys, dashboardKeys, goalKeys, budgetKeys } from "@/lib/query";`
- `invalidateCaches` (lines 63-68) BEFORE:

```ts
  function invalidateCaches() {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: accountKeys.list() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: goalKeys.all });
  }
```

AFTER (`accountKeys.all` also covers wishlist affordability key `[...accountKeys.all, "liquid-balance"]`):

```ts
  function invalidateCaches() {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: accountKeys.all });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: goalKeys.all });
    queryClient.invalidateQueries({ queryKey: budgetKeys.all });
  }
```

10b. `src/app/(app)/goals/_components/GoalLedger.tsx`
- After line 5 add: `import { goalKeys } from "@/lib/query";`
- Line 15 BEFORE: `    queryKey: ["goal-ledger", goalId],`
  AFTER: `    queryKey: [...goalKeys.detail(goalId), "ledger"],`

10c. `src/app/(app)/budgets/_components/BudgetDrillSheet.tsx` — drill list must refresh after a transaction edit.
- After line 6 add: `import { budgetKeys } from "@/lib/query";`
- Line 51 BEFORE:
  `    queryKey: ["budget-drill", budget?.category_id, year, month, isTransfer ? (budget as TransferBudgetRow).type : "budget"],`
  AFTER:
  `    queryKey: [...budgetKeys.all, "drill", budget?.category_id, year, month, isTransfer ? (budget as TransferBudgetRow).type : "budget"],`

10d. `src/app/(app)/budgets/weekly/_hooks/useWeeklyBudget.ts` line 35 BEFORE:
  `    queryKey: ["weekly-transactions", year, month],`
  AFTER:
  `    queryKey: [...budgetKeys.all, "weekly-tx", year, month],`
  (`budgetKeys` is already imported at line 5.)

## Step 11 — `src/app/(app)/goals/_components/GoalCard.tsx`

11a. Collected amount red when negative (P6). Lines 54-56 BEFORE:

```tsx
          <p className="font-bold text-gray-900">
            {hideBalances ? MASK : formatCurrency(goal.collected_amount)}
          </p>
```

AFTER:

```tsx
          <p className={`font-bold ${goal.collected_amount < 0 ? "text-red-600" : "text-gray-900"}`}>
            {hideBalances ? MASK : formatCurrency(goal.collected_amount)}
          </p>
```

11b. Overspend line. The bar already shows 0% (`getGoals` clamps `percent` via `Math.max(0, …)`) and red
(`getGoalColors(0)`). Insert right AFTER the progress bar block (after line 71 `</div>` that closes `h-2 bg-gray-100 …`):

```tsx
      {goal.collected_amount < 0 && (
        <p className="text-xs text-red-600 font-medium mb-2">
          {t("overspent", { amount: hideBalances ? MASK : formatCurrency(-goal.collected_amount) })}
        </p>
      )}
```

11c. Line 81 BEFORE:

```tsx
        {expanded ? "Hide history ▲" : "Show history ▾"}
```

AFTER:

```tsx
        {expanded ? `${t("hideHistory")} ▲` : `${t("showHistory")} ▾`}
```

No form-level blocking: P6 = allow withdrawals above collected.

## Step 12 — migration file (CREATE ONLY — orchestrator applies after owner approval)

Create `supabase/migrations/20260924_budget_period_goal_account.sql`:

```sql
-- Repo drift fix: both columns were applied via MCP on 2026-08-11 without a migration file
-- (ex bf-ayj budget_period, ex bf-6rl savings_goals.account_id). Both unused in code for now (design P7 / bf-yts).
-- Idempotent: IF NOT EXISTS skips the whole clause (incl. FK) when the column already exists. No drops.
-- ORCHESTRATOR APPLIES AFTER OWNER APPROVAL — executor must NOT run this.
ALTER TABLE public.transactions  ADD COLUMN IF NOT EXISTS budget_period date;
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.accounts(id) ON DELETE SET NULL;
```

Matches `src/db/schema.ts:150` (`date("budget_period")`) and `:201` (`uuid("account_id")…onDelete: "set null"`).

## Step 13 — i18n + AGENTS.md

13a. `src/i18n/messages/en.json`
- `transactions`: after `"goalNotFound": "Goal not found or does not belong to you.",` add
  `"goalNotAllowed": "Goals can only be linked to spending or transfers.",`
- `goals`: change `"deadline_prefix": "Deadline"` (line 165) to `"deadline_prefix": "Deadline",` and add after it:
  ```json
      "showHistory": "Show history",
      "hideHistory": "Hide history",
      "overspent": "Used {amount} more than collected"
  ```
- `budgets`: after `"remaining": "Remaining",` add `"fundedFromGoals": "Funded from goals",`

13b. `src/i18n/messages/id.json` — same keys, same positions:
- `transactions`: `"goalNotAllowed": "Goal hanya bisa dikaitkan ke pengeluaran atau transfer.",`
- `goals` (after `"deadline_prefix": "Tenggat",`):
  ```json
      "showHistory": "Tampilkan riwayat",
      "hideHistory": "Sembunyikan riwayat",
      "overspent": "Terpakai {amount} melebihi yang terkumpul"
  ```
- `budgets`: `"fundedFromGoals": "Dibiayai dari goal",`

Validate both files are valid JSON (`python3 -c "import json;json.load(open('src/i18n/messages/en.json'));json.load(open('src/i18n/messages/id.json'))"`).

13c. `AGENTS.md`
- Line 160 (section "Goals: `collected_amount` derived (bf-4ln)") — replace the sentence
  "`collected_amount` = base kolom + Σ `transactions` bertipe `transfer` dengan `goal_id` match (deleted_at NULL)."
  with:
  "`collected_amount` = base kolom + Σ `transfer` ber-`goal_id` − Σ `spending` ber-`goal_id` (deleted_at NULL). Boleh negatif (P6: pemakaian > terkumpul diizinkan; `percent` di-clamp 0, GoalCard tampil merah)."
- Add right under that paragraph:

  ```md
  **Aturan tanda goal (bf-btz):** tipe transaksi menentukan arah, bukan akun. `transfer`+goal = setoran, `spending`+goal = pemakaian, `earning`+goal = DITOLAK server (`goalAllowed` di `transactions/_lib/goalRule.ts`). Spending ber-goal **dikecualikan** dari expense budget, drill-down, dan weekly (`isNull(transactions.goal_id)` di `getBudgetsWithSpending` type spending, `getTransactionsForBudget`, `getTransactionsForWeeklyBudget`); ditampilkan terpisah sebagai "Funded from goals" (`getGoalFundedSpending`). Halaman Transactions tetap arus kas mentah.
  ```

- Line 164 (section "Wishlist Affordability (bf-ez2)") — replace the whole paragraph with (fixes the stale
  `goal_type "emergency"` claim; the CHECK constraint is `Saving | Investment` only, and the code subtracts
  allocated goal money, not remaining targets):

  ```md
  "Bisa beli" ≠ punya uang. Patokan = **uang bebas** = liquid − `allocated`, dengan `allocated` = Σ transfer ber-`goal_id` yang masuk akun liquid (`getLiquidGoalAllocated`). `goal_type` hanya `Saving | Investment` (CHECK constraint) — tidak ada tipe "emergency"; dana darurat = goal biasa bertipe `Saving`, jadi ikut terhitung lewat transfernya. 3 tingkat: 🟢 freeCash≥harga · ⚠️ liquid cukup tapi kuras alokasi · 🔴 liquid kurang. Lihat `getAffordabilityAction` di `wishlist/actions.ts`.
  ```

---

## Acceptance (owner runs)

1. `npm run test:run` — `goalRule.test.ts` + `messages.test.ts` green.
2. `npm run build` — green (type-safe i18n keys, no unused-import errors).
3. Manual, one month, fresh numbers:
   - Budget "Food" 1jt. Spending Food 400rb (no goal). Spending Food 2jt **From Goal = Dana Darurat**.
   - `/budgets`: Food actual = 400rb; Overall Spending excludes the 2jt; line "Funded from goals: 2 jt" visible.
   - Drill Food → only the 400rb row. `/budgets/weekly` Food week → only 400rb.
   - `/goals` Dana Darurat collected dropped 2jt; history shows `-2 jt` in red; toggle labels translated.
   - Edit that 2jt spending → switch type to Earning → goal field disappears, save succeeds with goal cleared.
   - Direct call `createTransactionAction({ …, transaction_type: "earning", goal_id: <uuid> })` → `goalNotAllowed`.
   - Spend more than collected from a small goal → collected red + "Used Rp X more than collected", bar 0%.
   - All of the above refresh without reload (budget, drill, weekly, ledger, wishlist freeCash).
4. Transactions page still lists the 2jt (P1: raw cash flow).

## Out of scope (do not do)
- Saving section / deleting `getTransferBudgets` → plan 2.
- `budget_period` usage (P7), `savings_goals.account_id` usage, backfilling `goal_id` on imported rows (T6).
