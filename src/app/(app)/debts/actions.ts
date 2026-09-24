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
