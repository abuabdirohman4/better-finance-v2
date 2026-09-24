# bf-13t — AP/AR (Payables / Receivables): Design

**Date:** 2026-09-24 · **Issue:** bf-13t · **Status:** DESIGN (no code, no DB change yet)
**Depends on:** bf-3e0 (done: `accounts.is_liability`), bf-4ln pattern (`transactions.goal_id`)

---

## 0. What exists today (read before deciding)

| Thing | Where | State |
|---|---|---|
| Accounts named `AR` and `AP` | created by `scripts/migrate-sheet.ts:452-458` | `asset_category = "liquid"`. AP flagged `is_liability` by bf-3e0 (manual SQL). |
| AR/AP transactions | `migrate-sheet.ts:689-697` | Imported as **one-way transfers only: cash → AR/AP**. Rows going the other way are skipped. No counterparty, no per-debt link. |
| AR/AP balance | `migrate-sheet.ts:1040-1042, 1100-1110` | No opening transaction. `current_balance` gets **overwritten with the Summary value** after recompute. That means the balance is not the sum of its transactions (this breaks the 1-source-of-truth rule). |
| Net Worth | `src/db/queries/assets.ts:62-68,117`, `src/db/queries/accounts.ts:97` | `netWorth = liquid + nonLiquid − Σ(liability.current_balance)`. This assumes an AP balance is **positive when you owe**. |
| Liability UI | `src/app/(app)/net-worth/page.tsx:119-131,183+` | Shows `-{balance}`. Assumes positive balance means owed. |
| Categories `AP` / `AR` | `src/lib/constants.ts:58-59`, seed trigger `supabase/migrations/20260723_rename_account_types.sql:41-42` (group `saving`) | Seeded for every new user. The importer **blacklists** them (`migrate-sheet.ts:58-59`), so the real data puts AR/AP into accounts, not categories. The seeded categories are almost certainly unused. **Verify with a SELECT before deprecating them** (§5). |

**How the owner records debts today:** a single AR account and a single AP account work as buckets. Money moves between them and cash through transfers. There's no counterparty, no due date and no per-debt status. The bucket totals match the sheet only because the importer overwrites them.

### Sign bug risk (verify first)

Transfer semantics (`apply_transaction_balances`: source −, dest +) mean that **borrowing** (AP → cash) drives the AP balance **negative**, and **repaying** (cash → AP) pushes it back toward 0. So when AP follows transactions, a debt shows as a **negative** balance. The current Net Worth code *subtracts* the liability balance. For a negative AP balance, that **adds** the debt to net worth.

Check the stored AP sign before building:
```sql
SELECT name, current_balance, is_liability FROM accounts WHERE user_id = '<uid>' AND name IN ('AR','AP');
```
- If AP > 0: the Summary stored "owed" as a positive number. To move to the natural sign, flip it once (§4).
- If AP < 0: **today's Net Worth is already inflated by 2×|AP|**. That's a live bug; fix it in the same change.

---

## 1. Recommended model

> **One `debts` table holds only the metadata. Money moves only through ordinary transfers tagged with `transactions.debt_id` (the same pattern as `goal_id`), in and out of a *ledger account* (AR, AP, or any liability account). Outstanding and status are derived, never stored.**

- No new balance mechanism. Every movement goes through `createTransaction` + `applyTransactionBalancesRpc`.
- **Net Worth needs no new code.** The ledger accounts (AR/AP) are already accounts, so they're already counted. You only need to fix the sign convention.
- The debts page is just a **per-counterparty breakdown** of the AR/AP account balances, which is how `/goals` breaks down tagged transfers.

### Direction table (ledger = `debts.account_id`)

| Event | Transaction | Ledger delta |
|---|---|---|
| Lend (receivable created) | transfer **cash → AR** | + |
| Collect repayment | transfer **AR → cash** | − |
| Borrow (payable created) | transfer **AP → cash** | − (AP goes negative = owed) |
| Repay | transfer **cash → AP** | + |
| Write-off / forgive (later) | spending *from* AR (receivable) or earning *into* AP (payable), category "Other" | toward 0 |
| Interest paid (later) | extra **spending** from cash, category `Interest`, with `debt_id` | none on ledger |

```
ledgerDelta(debt) = Σ tagged tx with to_account_id = ledger  −  Σ tagged tx with account_id = ledger
outstanding       = opening_amount + (direction = 'receivable' ? ledgerDelta : −ledgerDelta)
status            = outstanding <= 0 ? 'settled' : (due_date < today ? 'overdue' : 'open')
```

`opening_amount` covers debts that existed before the app. It's the part of the ledger balance that was never recorded as a tagged transaction (for example, the legacy AR/AP balances from the import).

### Why one table, not two
`receivables` and `payables` would have identical columns. Every query, action and component would exist twice, differing only in the sign. A `direction` column is one CHECK constraint. SMB invoices and supplier bills later still fit: the same table plus a future `invoice_no` or `counterparty_id`.

### Why `debt_id` tagging, not one account per debt
One account per debt would copy the bf-z6w "1 account = 1 sub-product" pattern. But every debt would then show up in the transaction account pickers and Net Worth cards, and the metadata (counterparty, due date) would still need a table. Tagging keeps the pickers clean and reuses the goal pattern that's already proven.

---

## 2. SQL migration sketch — `supabase/migrations/2026MMDD_debts.sql`

```sql
-- bf-13t: debts (AP/AR). Metadata only; money moves via transactions.debt_id.
CREATE TABLE IF NOT EXISTS public.debts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('receivable','payable')),
  counterparty    text NOT NULL,                 -- ponytail: free text; counterparties table when SMB lands
  account_id      uuid NOT NULL REFERENCES public.accounts(id),  -- ledger (AR / AP / credit card …)
  opening_amount  numeric(18,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  due_date        date,
  note            text,
  archived_at     timestamptz,                   -- hide from list; NOT status (status is derived)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON public.debts(user_id, direction);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_debt_id ON public.transactions(debt_id);

-- Sign convention (ONLY if the §0 check shows AP stored positive):
-- UPDATE public.accounts SET current_balance = -current_balance
--   WHERE is_liability AND current_balance > 0;

-- AR is not spendable cash → out of /accounts + wishlist free-cash (decision D5):
-- UPDATE public.accounts SET asset_category = 'investment' WHERE name = 'AR';

-- Legacy categories (decision D2): deactivate, keep rows for old tx.
UPDATE public.categories SET is_active = false WHERE slug IN ('ap','ar') AND group_name = 'saving';
-- + CREATE OR REPLACE seed_defaults_for_new_user() without the AP/AR rows (copy of 20260723 fn minus 2 lines).
```

Why the design leaves some things out:
- No `status` column: it's derived, and storing it would create a second source of truth.
- No `principal` column: principal = opening plus the increases, derived.
- No `interest_rate` column and no `installments` table (see §6).
- Drizzle: add `debts` to `src/db/schema.ts` and `debt_id` to `transactions`, matching the SQL.

---

## 3. Code touched

| File | Change | ~Lines |
|---|---|---|
| `supabase/migrations/2026MMDD_debts.sql` | §2 | 45 |
| `src/db/schema.ts` | `debts` table + `transactions.debt_id` | 25 |
| `src/db/queries/debts.ts` (new) | `getDebts(userId)`: one grouped subquery for `ledgerDelta` per debt, LEFT JOIN (copy of `getGoals` shape), returns `outstanding`, `status`. `getDebtById`, `createDebt`, `updateDebt`, `archiveDebt`. **Every query filters `user_id`.** | 150 |
| `src/lib/debt.ts` (new) | pure `calcOutstanding` + `debtStatus` (unit-tested) | 30 |
| `src/lib/schemas/debt.ts` (new) | zod: direction, counterparty min 1, account_id uuid, opening_amount ≥ 0, due_date, note. Payment: amount > 0, cash account uuid, date | 35 |
| `src/app/(app)/debts/actions.ts` (new) | `getDebtsAction`, `createDebtAction` (optionally with an initial disbursement tx), `updateDebtAction`, `archiveDebtAction`, `recordDebtMovementAction(debtId, cashAccountId, amount, date, kind: 'increase'\|'repay')`. The last one picks the transfer direction from the table in §1, checks `getAccountById` for **both** cash and ledger, rejects ledger = cash, then calls `createTransaction` with `debt_id` + `applyTransactionBalancesRpc` | 170 |
| `src/lib/schemas/transaction.ts`, `src/db/queries/transactions.ts`, `transactions/actions.ts` | add `debt_id` next to `goal_id` (select, insert, `"debt_id" in input` update-preserve, ownership check). Editing or deleting a tagged tx then updates outstanding automatically | 25 |
| `src/app/(app)/debts/_hooks/useDebts.ts` (new) | TanStack hooks. Invalidate debts + accounts + assets + transactions keys on mutate | 60 |
| `src/app/(app)/debts/page.tsx` (new) | Page Pattern header. Tabs Receivable / Payable. Totals, overdue first, hide settled behind a toggle. **Untracked** row = ledger balance − Σ outstanding (legacy amount not yet split per person) | 180 |
| `debts/_components/DebtBottomSheet.tsx` (new) | create/edit. `SingleSelect` for ledger (defaults to AR/AP) and cash account. "Record money moving now" toggle: on = initial transfer, off = `opening_amount` | 180 |
| `debts/_components/DebtMovementSheet.tsx` (new) | repay / collect / add more | 110 |
| `debts/_components/DebtCard.tsx` (new) | counterparty, outstanding, progress, due badge. Respects `hideBalances` | 70 |
| `src/db/queries/assets.ts`, `src/db/queries/accounts.ts:97` | sign fix: `netWorth = Σ current_balance` (no subtraction), `totalLiabilities = Σ abs(liability)` for display | 10 |
| `src/app/(app)/net-worth/page.tsx` | display `abs()`. AR/AP cards link to `/debts` | 10 |
| `src/lib/constants.ts` | drop AP/AR seed rows | −2 |
| `src/i18n/messages/en.json` + `id.json` | `debts` namespace | 2 × 40 |
| `src/lib/__tests__/debt.test.ts` (new) | outstanding/status for the 4 directions + opening | 50 |

**Size:** about 15 files and 1,200 lines, so **mode A (Antigravity)**. Suggested split: (1) migration, schema, queries, sign fix and tests; (2) actions and the `debt_id` plumbing; (3) UI and i18n.

---

## 4. Net Worth integration

- AR and AP are accounts, so they're **already inside Net Worth**. With the natural sign, `netWorth = Σ all included balances`: AR adds, AP (negative) subtracts. No per-debt summing happens in Net Worth.
- Timing: a debt counts **from the moment its money moves** (the tagged transfer). A pre-existing debt counts from the moment the owner creates it with `opening_amount` **and** that amount is already in the ledger balance (the legacy import). If there's a brand-new `opening_amount` with no ledger balance behind it, it shows on `/debts` but not in Net Worth. **Rule for v1:** `opening_amount` is only for "already in the ledger". To make it count in Net Worth, use the "record money moving now" toggle.
- The Net Worth page only needs the display flip and a link.

## 5. Legacy categories `AP` / `AR`

Deactivate them (`is_active = false`). Use soft delete, never a hard delete, and drop them from the seed trigger and `constants.ts`. First run `SELECT count(*) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.slug IN ('ap','ar')`. If the count is > 0, those rows are transfers mis-tagged with a category. Leave them alone: they still render, and budgets ignore the `saving` group transfers.

Legacy **balances** (AR/AP accounts from the import) stay as they are. The `/debts` page shows them as the "Untracked" remainder until the owner splits them into per-person debts with `opening_amount`.

## 6. v1 vs later

| v1 | Later (no rewrite needed) |
|---|---|
| `debts` + `debt_id`, derived outstanding/status | **Installments**: `debt_schedules(debt_id, due_date, amount)`. Payments stay tagged transactions, and a schedule row is "paid" when the cumulative tagged repayments cover it. |
| Single `due_date`, overdue badge | **Interest**: `debts.interest_rate` for display/projection only. Actual interest paid = `spending` + `debt_id` + category `Interest` (works in v1 already, just no form). |
| Counterparty free text | `counterparties` table (SMB: customers/suppliers), backfilled from distinct text |
| Movements only from `/debts` | "For debt (optional)" field in `TransactionForm`, auto-suggest like goals |
| Manual | Due-date reminders; write-off button; invoice number/PDF for SMB |

---

## 7. Decisions (for the owner)

Product-preference decisions first:

1. **D1: Required v1 fields.** Recommend: direction, counterparty, amount, ledger account (defaults to AR/AP); due date and note optional. *Minimum to make the list useful. Anything else can be added later without a migration rewrite.*
2. **D2: Legacy AP/AR categories.** Recommend: **deprecate** (soft `is_active=false`, removed from the seed). *The importer never used them, and keeping them lets a user record debt as spending, which bypasses the debt model.*
3. **D3: Paying a debt.** Recommend: **yes**. A payment is a tagged transfer that moves balances through the RPC, and "paid" is derived when outstanding reaches 0. *This is the only option that keeps the 1-source-of-truth rule. A stored status flag would drift.*
4. **D4: When it enters Net Worth.** Recommend: **when money moves** (through the ledger account). *Net Worth stays exactly equal to the account balances, so nothing new needs reconciling.*
5. **D5: Where AR shows.** Recommend moving the AR account to non-liquid (`asset_category='investment'`). *A loan to a friend isn't spendable. Today it inflates /accounts and wishlist "free cash".*
6. **D6: One table or two.** Recommend **one `debts` table** with `direction`. *Same columns, so two tables would double every query and component.*
7. **D7: Liability sign convention.** Recommend the **natural sign** (AP negative when owed, `netWorth = Σ balances`), with a one-time flip if needed. *Transfers already produce that sign. The current "subtract positive" rule is wrong the moment AP moves through transactions.* **Run the §0 SELECT first. Net Worth may already be wrong today.**
