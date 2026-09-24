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
