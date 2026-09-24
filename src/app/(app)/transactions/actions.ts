"use server";
import { z } from "zod";

import {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
  type TransactionRow,
  type TransactionFilters,
} from "@/db/queries/transactions";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/schemas/transaction";
import { getAccountById, getCategories, applyTransactionBalancesRpc, type CategoryRow } from "@/db/queries/accounts";
import { getGoalsForSelect, type GoalSelectRow } from "@/db/queries/goals";
import { getDebtById } from "@/db/queries/debts";
import { checkDebtTag } from "@/lib/debt";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import { createTransactionSchema, updateTransactionSchema } from "@/lib/schemas/transaction";
import { calcUpdateDeltas } from "./_lib/balanceDelta";
import { getTranslations } from "next-intl/server";
import { goalAllowed } from "./_lib/goalRule";

export async function getTransactionsAction(
  filters: TransactionFilters = {}
): Promise<ServerActionResult<TransactionRow[]>> {
  try {
    const user = await requireUser();
    const data = await getTransactions(user.id, filters);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function getCategoriesAction(): Promise<ServerActionResult<CategoryRow[]>> {
  try {
    const user = await requireUser();
    const data = await getCategories(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function getGoalsForTransferAction(): Promise<ServerActionResult<GoalSelectRow[]>> {
  try {
    const user = await requireUser();
    const all = await getGoalsForSelect(user.id);
    return { success: true, data: all };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function createTransactionAction(
  input: CreateTransactionInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();

    const parsed = createTransactionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }
    const validInput = parsed.data;

    // Validate account ownership before inserting
    const sourceAccount = await getAccountById(user.id, validInput.account_id);
    if (!sourceAccount) return { success: false, message: (await getTranslations("transactions"))("accountNotFound") };

    if (validInput.transaction_type === "transfer" && validInput.to_account_id) {
      if (validInput.account_id === validInput.to_account_id) {
        return { success: false, message: (await getTranslations("transactions"))("sameAccount") };
      }
      const destAccount = await getAccountById(user.id, validInput.to_account_id);
      if (!destAccount) return { success: false, message: (await getTranslations("transactions"))("destinationNotFound") };
    }

    if (validInput.goal_id && !goalAllowed(validInput.transaction_type)) {
      return { success: false, message: (await getTranslations("transactions"))("goalNotAllowed") };
    }
    if (validInput.goal_id) {
      const goals = await getGoalsForSelect(user.id);
      if (!goals.find((g) => g.id === validInput.goal_id)) {
        return { success: false, message: (await getTranslations("transactions"))("goalNotFound") };
      }
    }

    if (validInput.debt_id) {
      const debt = await getDebtById(user.id, validInput.debt_id);
      if (!debt) return { success: false, message: (await getTranslations("transactions"))("debtNotFound") };
      const tagError = checkDebtTag(validInput, debt.account_id);
      if (tagError) return { success: false, message: (await getTranslations("transactions"))(tagError) };
    }

    const id = await createTransaction(user.id, validInput);

    const delta = validInput.transaction_type === "earning" ? validInput.amount : -validInput.amount;
    const adjustments: { account_id: string; delta: number }[] = [
      { account_id: validInput.account_id, delta },
    ];
    if (validInput.transaction_type === "transfer" && validInput.to_account_id) {
      adjustments.push({ account_id: validInput.to_account_id, delta: validInput.amount });
    }
    await applyTransactionBalancesRpc(user.id, adjustments);

    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}


export async function updateTransactionAction(
  txId: string,
  input: UpdateTransactionInput
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();

    // Fetch old transaction to reverse its balance effect
    const old = await getTransactionById(user.id, txId);
    if (!old) return { success: false, message: (await getTranslations("transactions"))("notFound") };

    const parsed = updateTransactionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }
    const validInput = parsed.data;

    const newType = validInput.transaction_type ?? old.transaction_type;
    const newAmount = validInput.amount ?? old.amount;
    const newAccountId = validInput.account_id ?? old.account_id;
    const newToAccountId = "to_account_id" in validInput ? validInput.to_account_id : old.to_account_id;

    // Ownership guard: akun baru (jika diganti) harus milik user
    if (newAccountId !== old.account_id) {
      const acc = await getAccountById(user.id, newAccountId);
      if (!acc) return { success: false, message: (await getTranslations("transactions"))("accountNotFound") };
    }
    if (newType === "transfer" && newToAccountId && newToAccountId !== old.to_account_id) {
      const destAcc = await getAccountById(user.id, newToAccountId);
      if (!destAcc) return { success: false, message: (await getTranslations("transactions"))("destinationNotFound") };
    }
    if (newType === "transfer" && newAccountId === newToAccountId) {
      return { success: false, message: (await getTranslations("transactions"))("sameAccount") };
    }

    const newGoalId = "goal_id" in validInput ? validInput.goal_id : old.goal_id;
    if (newGoalId && !goalAllowed(newType)) {
      return { success: false, message: (await getTranslations("transactions"))("goalNotAllowed") };
    }
    if (newGoalId && newGoalId !== old.goal_id) {
      const goals = await getGoalsForSelect(user.id);
      if (!goals.find((g) => g.id === newGoalId)) {
        return { success: false, message: (await getTranslations("transactions"))("goalNotFound") };
      }
    }

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

    // All balance adjustments atomic via Postgres RPC
    const adjustments = calcUpdateDeltas(
      {
        account_id: old.account_id,
        to_account_id: old.to_account_id,
        transaction_type: old.transaction_type as "spending" | "earning" | "transfer",
        amount: old.amount,
      },
      {
        account_id: newAccountId,
        to_account_id: newToAccountId ?? null,
        transaction_type: newType as "spending" | "earning" | "transfer",
        amount: newAmount,
      }
    );
    await applyTransactionBalancesRpc(user.id, adjustments);

    await updateTransaction(user.id, txId, validInput);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}

export async function deleteTransactionAction(
  txId: string
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const txIdParsed = z.string().uuid().safeParse(txId);
    if (!txIdParsed.success) return { success: false, message: (await getTranslations("transactions"))("invalidId") };
    const tx = await getTransactionById(user.id, txId);
    if (!tx) return { success: false, message: (await getTranslations("transactions"))("notFound") };

    const reverseDelta = tx.transaction_type === "earning" ? -tx.amount : tx.amount;
    const adjustments: { account_id: string; delta: number }[] = [
      { account_id: tx.account_id, delta: reverseDelta },
    ];
    if (tx.transaction_type === "transfer" && tx.to_account_id) {
      adjustments.push({ account_id: tx.to_account_id, delta: -tx.amount });
    }
    await applyTransactionBalancesRpc(user.id, adjustments);

    await softDeleteTransaction(user.id, txId);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}
