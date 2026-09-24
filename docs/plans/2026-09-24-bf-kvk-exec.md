# bf-kvk — Goal reality check (uang goal ada di akunnya?)

**Date:** 2026-09-24 · **Epic:** app-s4hm.6 (M2.3) · **Mode:** B (direct, Sonnet) — 7 files, ~150 lines, all mechanical
**Depends:** bf-btz (goal-tagged spending is saved) — already merged (`9e4cc5b`).

---

## 0. Decision (read, do not re-litigate)

**Approach (a): DERIVE per-account goal allocation from transactions. Do NOT use `savings_goals.account_id`.**

```
allocated(account) = Σ transfer.amount  WHERE goal_id → active goal AND to_account_id = account
                   − Σ spending.amount  WHERE goal_id → active goal AND account_id    = account
shortfall(account) = allocated − account.current_balance
WARN when allocated > 0 AND shortfall > 0.01
```

Why not (b) `savings_goals.account_id`:
- bf-yts (2026-07-23) decided 1 goal spreads over many accounts (Dana Darurat = Jago + Bibit) and dropped `linked_account_id`. The sheet itself had one Goals row per (goal, account) — `migrate-sheet.ts:859` aggregates "Pendidikan SD" over Bibit + Emas + USD. A single FK per goal cannot represent that.
- (b) needs a picker UI (bf-6rl, deferred in the trio design) and a second source of truth that can disagree with the transactions.
- Precedent: `getLiquidGoalAllocated` (goals.ts, used by wishlist affordability) already locates goal money by `to_account_id`.

Rules baked in (technical, decided):
- **Only shortfall warns.** Balance > allocated is normal (free cash in the same account, deposits not tagged). Only "goals claim more than the account holds" is a problem.
- **Compare against `current_balance`** (modal / cost basis), NOT `current_value`. Goal transfers are cost basis; market swings must not raise warnings.
- **Only active goals** (`savings_goals.is_active = true`) — same as `getGoals`. Money of a deleted goal is freed.
- **Accounts with allocated ≤ 0 are ignored.** They occur when goal money was moved untagged into e.g. Wallet and then spent there with a goal tag (the P2 flow in the trio design). See ceiling 2.
- **Inactive accounts are included** (no `is_active` filter on accounts): goal money claimed in a closed account is a real shortfall.

Known ceilings (write them into AGENTS.md, do not fix now):
1. `savings_goals.collected_amount` base ("Opening Balance", also the sheet-import snapshot) has **no account** → the check is blind to it. It never causes a false warning, it only misses. Import did not set `goal_id` (trio T6) so most 2026 imported goal money is invisible to this check.
2. Move-then-spend (Bibit → Wallet untagged, then goal-tagged spending from Wallet) shows a shortfall on Bibit. The copy tells the user why.

Where: **goals page only**, a warning card under "Overall Goals Progress", rendered only when ≥1 account is short. No `accounts/[id]` change.

---

## 1. Files

| # | File | Change |
|---|---|---|
| 1 | `src/lib/goalReality.ts` | **NEW** — pure helper + types |
| 2 | `src/lib/__tests__/goalReality.test.ts` | **NEW** — vitest |
| 3 | `src/db/queries/goals.ts` | add `getGoalFlowsByAccount` |
| 4 | `src/app/(app)/goals/actions.ts` | add `getGoalRealityCheckAction` |
| 5 | `src/lib/query.ts` | add `goalKeys.reality` |
| 6 | `src/app/(app)/goals/_hooks/useGoals.ts` | add `realityQuery` |
| 7 | `src/app/(app)/goals/page.tsx` | render warning card |
| 8 | `src/i18n/messages/en.json` + `id.json` | 3 keys under `goals` |
| 9 | `AGENTS.md` | short section (step 9) |

No migration. No new dependency. Do NOT touch `savings_goals.account_id`, wishlist, or accounts pages.

---

## 2. Step 1 — `src/lib/goalReality.ts` (new)

```ts
// Goal reality check (bf-kvk): does each account still hold the goal money tagged into it?
export interface GoalAccountFlow {
  account_id: string;
  account_name: string;
  current_balance: number | string; // pg numeric may arrive as string
  amount: number | string; // signed: + goal transfer in, − goal spending out
}

export interface GoalRealityRow {
  account_id: string;
  account_name: string;
  allocated: number;
  balance: number;
  shortfall: number; // allocated − balance, always > 0 in the output
}

const EPS = 0.01;

/** Merge signed goal flows per account; return only accounts holding less than their goal allocation, biggest gap first. */
export function buildGoalRealityCheck(flows: GoalAccountFlow[]): GoalRealityRow[] {
  const byId = new Map<string, GoalRealityRow>();
  for (const f of flows) {
    const row = byId.get(f.account_id) ?? {
      account_id: f.account_id,
      account_name: f.account_name,
      allocated: 0,
      balance: Number(f.current_balance),
      shortfall: 0,
    };
    row.allocated += Number(f.amount);
    byId.set(f.account_id, row);
  }
  return [...byId.values()]
    .map((r) => ({ ...r, shortfall: r.allocated - r.balance }))
    .filter((r) => r.allocated > EPS && r.shortfall > EPS)
    .sort((a, b) => b.shortfall - a.shortfall);
}
```

---

## 3. Step 2 — `src/lib/__tests__/goalReality.test.ts` (new)

```ts
import { describe, it, expect } from "vitest";
import { buildGoalRealityCheck, type GoalAccountFlow } from "../goalReality";

const flow = (p: Partial<GoalAccountFlow>): GoalAccountFlow => ({
  account_id: "a", account_name: "Bibit", current_balance: 0, amount: 0, ...p,
});

describe("buildGoalRealityCheck", () => {
  it("flags an account holding less than its goal transfers", () => {
    const out = buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 3_000_000 })]);
    expect(out).toEqual([
      { account_id: "a", account_name: "Bibit", allocated: 5_000_000, balance: 3_000_000, shortfall: 2_000_000 },
    ]);
  });

  it("ignores accounts that hold at least their allocation (free cash is normal)", () => {
    expect(buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 9_000_000 })])).toEqual([]);
    expect(buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 5_000_000 })])).toEqual([]);
  });

  it("nets goal spending out of the same account", () => {
    const out = buildGoalRealityCheck([
      flow({ amount: 5_000_000, current_balance: 3_000_000 }),
      flow({ amount: -2_000_000, current_balance: 3_000_000 }),
    ]);
    expect(out).toEqual([]);
  });

  it("ignores accounts whose allocation is zero or negative", () => {
    const out = buildGoalRealityCheck([
      flow({ account_id: "w", account_name: "Wallet", amount: -1_000_000, current_balance: 0 }),
    ]);
    expect(out).toEqual([]);
  });

  it("parses numeric strings, tolerates rounding, sorts by biggest shortfall", () => {
    const out = buildGoalRealityCheck([
      flow({ account_id: "x", account_name: "X", amount: "1000.004", current_balance: "1000" }),
      flow({ account_id: "s", account_name: "Small", amount: "300", current_balance: "200" }),
      flow({ account_id: "b", account_name: "Big", amount: "900", current_balance: "100" }),
    ]);
    expect(out.map((r) => r.account_id)).toEqual(["b", "s"]);
  });
});
```

---

## 4. Step 3 — `src/db/queries/goals.ts`

3a. Change the schema import (line 3) to also import `accounts`:

```ts
import { savingsGoals, transactions, categories, accounts } from "@/db/schema";
```

3b. Add at the top of the file, after the drizzle/db imports:

```ts
import type { GoalAccountFlow } from "@/lib/goalReality";
```

3c. Append at the end of the file:

```ts
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
```

Notes for the executor:
- `and`, `eq`, `sql`, `isNull`, `isNotNull` are already imported in this file. Do not add `inArray` twice.
- No `accounts.is_active` filter — intentional (see §0).
- Do NOT change `getGoals`, `getLiquidGoalAllocated`, or any other function.

---

## 5. Step 4 — `src/app/(app)/goals/actions.ts`

4a. Extend the existing import from `@/db/queries/goals` with `getGoalFlowsByAccount`, and add:

```ts
import { buildGoalRealityCheck, type GoalRealityRow } from "@/lib/goalReality";
```

4b. Append:

```ts
export async function getGoalRealityCheckAction(): Promise<ServerActionResult<GoalRealityRow[]>> {
  try {
    const user = await requireUser();
    const flows = await getGoalFlowsByAccount(user.id);
    return { success: true, data: buildGoalRealityCheck(flows) };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}
```

---

## 6. Step 5 — `src/lib/query.ts`

In `goalKeys` add one line after `detail`:

```ts
  reality: () => [...goalKeys.all, "reality"] as const,
```

(Under `goalKeys.all` on purpose: `TransactionBottomSheet` already invalidates `goalKeys.all` after every transaction mutation, so the card refreshes for free.)

---

## 7. Step 6 — `src/app/(app)/goals/_hooks/useGoals.ts`

6a. Add `getGoalRealityCheckAction` to the import from `"../actions"`.

6b. After `accountsQuery`, add:

```ts
  const realityQuery = useQuery({
    queryKey: goalKeys.reality(),
    queryFn: async () => {
      const res = await getGoalRealityCheckAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });
```

6c. Add `realityQuery` to the returned object.

---

## 8. Step 7 — `src/app/(app)/goals/page.tsx`

7a. Imports: change `import { ChevronLeft } from "lucide-react";` to

```ts
import { ChevronLeft, TriangleAlert } from "lucide-react";
```

(`TriangleAlert` — lucide-react 1.24 canonical name; do not use `AlertTriangle`.)

7b. Replace
```ts
  const { query, createMutation, updateMutation, deleteMutation } = useGoals();
  const goals = query.data ?? [];
```
with
```ts
  const { query, realityQuery, createMutation, updateMutation, deleteMutation } = useGoals();
  const goals = query.data ?? [];
  const shortAccounts = realityQuery.data ?? [];
```

7c. Insert this block **directly after** the closing `</div>` of the "Overall Goals Progress" card and **before** `{query.isLoading && (`:

```tsx
        {shortAccounts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-amber-900">{t("realityTitle")}</h2>
                <p className="text-xs text-amber-800">{t("realityHint")}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {shortAccounts.map((r) => (
                <li key={r.account_id} className="bg-white rounded-xl px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2 font-medium text-gray-900">
                    <span className="truncate">{r.account_name}</span>
                    <span className="text-red-600 shrink-0">
                      {hideBalances ? MASK : `-${formatCurrency(r.shortfall)}`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t("realityDetail", {
                      allocated: hideBalances ? MASK : formatCurrency(r.allocated),
                      balance: hideBalances ? MASK : formatCurrency(r.balance),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
```

`MASK` and `hideBalances` already exist in the component — reuse them; every amount above goes through the mask.

---

## 9. Step 8 — i18n (both files, same keys, inside the `"goals"` object, after `"overspent"`)

`src/i18n/messages/en.json`:
```json
    "realityTitle": "Goal money check",
    "realityHint": "Goal transfers put more into these accounts than they hold now. A transaction may be missing, or goal money was moved out without a goal tag.",
    "realityDetail": "Goals: {allocated} · Balance: {balance}"
```

`src/i18n/messages/id.json`:
```json
    "realityTitle": "Cek uang goal",
    "realityHint": "Transfer goal memasukkan lebih banyak ke akun ini daripada saldonya sekarang. Mungkin ada transaksi yang belum dicatat, atau uang goal dipindah tanpa tag goal.",
    "realityDetail": "Goal: {allocated} · Saldo: {balance}"
```

Mind the comma after the existing `"overspent"` line. `messages.test.ts` fails if the key sets differ.

---

## 10. Step 9 — `AGENTS.md`

Add after the section "## Goals: `collected_amount` derived (bf-4ln)":

```md
## Goal reality check (bf-kvk)

Goals page warns when an account holds less than the goal money tagged into it. **Derived, no `savings_goals.account_id`** (bf-yts: 1 goal spans many accounts). Per account: `allocated = Σ goal transfers (to_account_id) − Σ goal spending (account_id)`, active goals only; warn when `allocated − current_balance > 0.01`. Surplus never warns (free cash is normal); compares `current_balance` (modal), not `current_value`. Pure logic `buildGoalRealityCheck` in `src/lib/goalReality.ts` (unit tested), query `getGoalFlowsByAccount`.
Ceilings: goal base `collected_amount` (opening / sheet import) has no account → invisible to the check. Move-then-spend (untagged Bibit → Wallet, goal spending from Wallet) shows a shortfall on the source.
```

Also in `docs/roadmap.md`: mark bf-kvk done if it is listed. README: one bullet under goals features ("warns when an account no longer holds the goal money tagged into it") if README has a goals feature list.

---

## 11. Verify (user runs; executor must not run build/dev)

```bash
npm run test:run   # goalReality.test.ts + messages.test.ts green
npm run build      # typo in drizzle select/import only shows here
```

Manual (on `/goals`):
1. No goal-tagged transfers → no amber card (nothing else changes on the page).
2. Transfer Rp 1.000.000 Mandiri → Bibit tagged goal X; then untagged transfer Rp 600.000 Bibit → Wallet, where Bibit had 0 before → card shows **Bibit −Rp 600.000**, "Goals: Rp 1.000.000 · Balance: Rp 400.000".
3. Toggle hide balances → all three amounts show `Rp •••`.
4. Delete (soft) the Bibit → Wallet transaction → card disappears after the sheet closes (goalKeys.all invalidation).
5. Switch locale to `id` → Indonesian copy.

Done = test + build green, 5 manual checks pass → `bd close bf-kvk`.
