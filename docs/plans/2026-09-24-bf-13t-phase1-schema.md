# bf-13t Phase 1: schema (debts table + transactions.debt_id)

**Date:** 2026-09-24 · **Issue:** bf-13t · **Design:** `docs/plans/2026-09-24-bf-13t-apar-design.md` (all 7 decisions APPROVED)
**Executor:** Sonnet (blind). **Next:** phase 2 (`2026-09-24-bf-13t-phase2-core.md`), then phase 3 (`...-phase3-ui.md`).

## Rules for the executor

- **Do NOT run any SQL.** Do not use MCP / psql / drizzle-kit push. The orchestrator applies every SQL block in this file after the owner approves.
- Do NOT run `npm run build`, `test`, or `dev`. The owner runs them.
- Only touch the files listed below.
- This phase is self-contained. Nothing in `src/` imports the new `debts` table yet; phase 2 does that.

> **Deploy order (orchestrator):** apply the migration (Block A) BEFORE running any build that includes this phase. `transactions.debt_id` is in the Drizzle schema, so any `select()` that reads all columns fails until the column exists.

## Files

| # | File | Change |
|---|---|---|
| 1 | `supabase/migrations/20260924_debts.sql` (new) | Block A below, verbatim |
| 2 | `src/db/schema.ts` | add the `debts` table + `transactions.debt_id` |
| 3 | `src/lib/constants.ts` | add `DebtDirection`; remove the AP/AR seed rows |

`src/types/index.ts` is not touched. Nothing imports it (checked with grep).

---

## Step 1: create `supabase/migrations/20260924_debts.sql`

Write this file exactly as shown (Block A):

```sql
-- bf-13t: debts (AP/AR). Metadata only; money moves via transfers tagged transactions.debt_id.
-- outstanding / status are DERIVED in the query layer (src/lib/debt.ts), never stored.
-- Idempotent: safe to re-run.

-- 1. debts table
CREATE TABLE IF NOT EXISTS public.debts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  direction       text NOT NULL CONSTRAINT debts_direction_check CHECK (direction IN ('receivable', 'payable')),
  counterparty    text NOT NULL CONSTRAINT debts_counterparty_check CHECK (char_length(btrim(counterparty)) BETWEEN 1 AND 100),
  account_id      uuid NOT NULL REFERENCES public.accounts(id),          -- ledger account (AR / AP / credit card)
  opening_amount  numeric(18,2) NOT NULL DEFAULT 0 CONSTRAINT debts_opening_amount_check CHECK (opening_amount >= 0),
  due_date        date,
  note            text CONSTRAINT debts_note_check CHECK (note IS NULL OR char_length(note) <= 200),
  archived_at     timestamptz,                                           -- hidden from list; NOT a status
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON public.debts(user_id, direction);

-- The app connects with admin credentials and filters user_id in code (AGENTS.md).
-- RLS is still on so the table is never readable through the public PostgREST API.
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debts_owner_all ON public.debts;
CREATE POLICY debts_owner_all ON public.debts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. transactions.debt_id (same pattern as goal_id, bf-4ln)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_debt_id ON public.transactions(debt_id);

-- A transaction belongs to a goal OR a debt, never both.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_goal_debt_exclusive;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_goal_debt_exclusive CHECK (goal_id IS NULL OR debt_id IS NULL);

-- 3. Retire the legacy AP/AR categories (decision D2). Soft delete: old rows stay valid.
UPDATE public.categories SET is_active = false
 WHERE slug IN ('ap', 'ar') AND group_name = 'saving' AND is_active;

-- 4. Seed function for new users: same as 20260723_rename_account_types.sql minus the AP/AR rows.
CREATE OR REPLACE FUNCTION public.seed_defaults_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.account_types (user_id, name, slug, sort_order, is_system) VALUES
        (NEW.id, 'Cash', 'cash', 1, TRUE),
        (NEW.id, 'Bank', 'bank', 2, TRUE),
        (NEW.id, 'E-wallet', 'ewallet', 3, TRUE);

    INSERT INTO public.categories (user_id, name, slug, group_name, sort_order, is_system) VALUES
        -- eating
        (NEW.id,'Dining Out','dining-out','eating',1,TRUE),
        (NEW.id,'Food','food','eating',2,TRUE),
        (NEW.id,'Fruits','fruits','eating',3,TRUE),
        (NEW.id,'Groceries','groceries','eating',4,TRUE),
        (NEW.id,'Grab Credit','grab-credit','eating',5,TRUE),
        -- living
        (NEW.id,'Charge','charge','living',1,TRUE),
        (NEW.id,'Credit','credit','living',2,TRUE),
        (NEW.id,'Children','children','living',3,TRUE),
        (NEW.id,'Entertainment','entertainment','living',4,TRUE),
        (NEW.id,'Health','health','living',5,TRUE),
        (NEW.id,'House','house','living',6,TRUE),
        (NEW.id,'Knowledge','knowledge','living',7,TRUE),
        (NEW.id,'Spouse','spouse','living',8,TRUE),
        (NEW.id,'Tools','tools','living',9,TRUE),
        (NEW.id,'Transport','transport','living',10,TRUE),
        (NEW.id,'Other Spend','other-spend','living',11,TRUE),
        -- saving (AP/AR removed, bf-13t: debts live in the debts table)
        (NEW.id,'Retained','retained','saving',3,TRUE),
        (NEW.id,'Sinking','sinking','saving',4,TRUE),
        (NEW.id,'Wishlist','wishlist','saving',5,TRUE),
        -- investing
        (NEW.id,'Business','business','investing',1,TRUE),
        (NEW.id,'Emergency','emergency','investing',2,TRUE),
        (NEW.id,'Investment','investment','investing',3,TRUE),
        -- giving
        (NEW.id,'Infaq Rezeki','infaq-rezeki','giving',1,TRUE),
        (NEW.id,'Tax Salary','tax-salary','giving',2,TRUE),
        (NEW.id,'Shodaqoh','shodaqoh','giving',3,TRUE),
        -- earning
        (NEW.id,'Net Salary','net-salary','earning',1,TRUE),
        (NEW.id,'Salary','salary','earning',2,TRUE),
        (NEW.id,'Allowance','allowance','earning',3,TRUE),
        (NEW.id,'Interest','interest','earning',4,TRUE),
        (NEW.id,'Other Earn','other-earn','earning',5,TRUE);

    RETURN NEW;
END; $function$;
```

---

## Step 2: `src/db/schema.ts`

### 2a. Add `debt_id` to `transactions`

Before:
```ts
    goal_id: uuid("goal_id").references(() => savingsGoals.id, { onDelete: "set null" }),
    note: text("note"),
```
After:
```ts
    goal_id: uuid("goal_id").references(() => savingsGoals.id, { onDelete: "set null" }),
    debt_id: uuid("debt_id").references(() => debts.id, { onDelete: "set null" }),
    note: text("note"),
```

In the same table's index list, before:
```ts
    index("idx_transactions_goal_id").on(t.goal_id),
  ]
);
```
After:
```ts
    index("idx_transactions_goal_id").on(t.goal_id),
    index("idx_transactions_debt_id").on(t.debt_id),
  ]
);
```

### 2b. Add the `debts` table

Insert this block **directly after** the whole `savingsGoals` table (after its closing `});`) and **before** the `// ── account_balance_snapshots ──` comment. `transactions` references `debts` lazily through `() => debts.id`, the same way it already references `savingsGoals`, so declaring it later is fine.

```ts
// ── debts (AP/AR, bf-13t) ─────────────────────────────────────────────────────
// Metadata only. Money moves via transfers tagged transactions.debt_id; outstanding is derived.

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // "receivable" | "payable" (DB CHECK)
    counterparty: text("counterparty").notNull(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => accounts.id), // ledger account
    opening_amount: numeric("opening_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    due_date: date("due_date"),
    note: text("note"),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_debts_user").on(t.user_id, t.direction)]
);
```

No new imports are needed. `index`, `numeric`, `date`, `text`, `timestamp` and `uuid` are already imported.

---

## Step 3: `src/lib/constants.ts`

### 3a. Add the type

Before:
```ts
export type AssetCategory = "liquid" | "investment";
```
After:
```ts
export type AssetCategory = "liquid" | "investment";

export type DebtDirection = "receivable" | "payable";
```

### 3b. Remove the AP/AR seed rows (decision D2)

Before:
```ts
  // saving
  { name: "AP", slug: "ap", group: "saving" },
  { name: "AR", slug: "ar", group: "saving" },
  { name: "Retained", slug: "retained", group: "saving" },
```
After:
```ts
  // saving (AP/AR removed, bf-13t: debts live in the debts table)
  { name: "Retained", slug: "retained", group: "saving" },
```

---

## Block B: one-off DATA SQL (orchestrator only, after owner approval; NOT a migration file)

**Orchestrator applies this after owner approval. The executor must NOT run it and must NOT put it in a file.**
Replace `:uid` with the owner's `user_profiles.id`.

Facts verified 2026-09-24: AP `current_balance = 0.00` (`is_liability = true`, 31 tx), AR `= 473900.00` (`asset_category = 'liquid'`, 26 tx), and the owner has no AP/AR categories.

```sql
-- B0. Pre-flight (read-only). Stop and report if any expectation fails.
SELECT id, name, slug, asset_category, is_liability, current_balance
  FROM public.accounts WHERE user_id = :uid AND slug IN ('ar', 'ap');
-- expect: ar = liquid / false / 473900.00 ; ap = liquid / true / 0.00

SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid = 'public.accounts'::regclass AND contype = 'c';
-- expect: nothing that forbids a negative current_balance (borrowing drives AP below 0)

SELECT id, name, current_balance
  FROM public.accounts WHERE user_id = :uid AND is_liability AND current_balance > 0;
-- expect: 0 rows. Any row = a liability stored "owed = positive" under the old convention.

-- B1. D5: AR is not spendable cash. Move it out of liquid (/accounts + wishlist free cash).
UPDATE public.accounts
   SET asset_category = 'investment', investment_group = NULL, updated_at = now()
 WHERE user_id = :uid AND slug = 'ar' AND asset_category = 'liquid';
-- expect: 1 row. Net Worth total is unchanged (AR moves from the liquid to the non-liquid bucket).

-- B2. D7: natural sign (AP negative when owed). AP = 0 today, so this is expected to touch 0 rows.
--     Run ONLY if the third B0 query returned rows AND the owner confirms that those balances mean "owed".
UPDATE public.accounts
   SET current_balance = -current_balance, updated_at = now()
 WHERE user_id = :uid AND is_liability AND current_balance > 0;
```

Why there's no AP flip: the balance is 0, so both sign conventions give the same Net Worth today. The code change in phase 2 (`netWorth = Σ balances`) makes a future borrow (AP → cash) show correctly.

## Done when

- The three files match this plan.
- `grep -n "debt" src/db/schema.ts` shows the table, the column and the index.
- Report back without running anything. The orchestrator applies Block A, and then Block B after owner approval.
