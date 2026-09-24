-- Repo drift fix: both columns were applied via MCP on 2026-08-11 without a migration file
-- (ex bf-ayj budget_period, ex bf-6rl savings_goals.account_id). Both unused in code for now (design P7 / bf-yts).
-- Idempotent: IF NOT EXISTS skips the whole clause (incl. FK) when the column already exists. No drops.
-- ORCHESTRATOR APPLIES AFTER OWNER APPROVAL — executor must NOT run this.
ALTER TABLE public.transactions  ADD COLUMN IF NOT EXISTS budget_period date;
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.accounts(id) ON DELETE SET NULL;
