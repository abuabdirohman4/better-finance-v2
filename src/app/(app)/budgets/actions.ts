"use server";

import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import {
  getBudgetsWithSpending,
  upsertBudget,
  deleteBudget,
  getTransactionsForWeeklyBudget,
  getTransactionsForBudget,
  getTransactionsForTransfer,
  getTransferBudgets,
  getGoalFundedSpending,
  type BudgetWithSpending,
  type BudgetTxRow,
  type TransferBudgetRow,
} from "@/db/queries/budgets";
import { getCategories, type CategoryRow } from "@/db/queries/accounts";
import { upsertBudgetSchema, type UpsertBudgetInput } from "@/lib/schemas/budget";
import { z } from "zod";
import {
  getManageCategories,
  createCategory,
  updateCategory,
  softDeleteCategory,
  renameCategoryGroup,
  type ManageCategoryRow,
} from "@/db/queries/categories";
import { upsertCategorySchema, type UpsertCategoryInput } from "@/lib/schemas/category";

export async function getBudgetsAction(
  year: number,
  month: number
): Promise<ServerActionResult<BudgetWithSpending[]>> {
  try {
    const user = await requireUser();
    const data = await getBudgetsWithSpending(user.id, year, month);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function getIncomeBudgetsAction(
  year: number,
  month: number
): Promise<ServerActionResult<BudgetWithSpending[]>> {
  try {
    const user = await requireUser();
    const data = await getBudgetsWithSpending(user.id, year, month, "earning");
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function getTransferBudgetsAction(
  year: number,
  month: number
): Promise<ServerActionResult<TransferBudgetRow[]>> {
  try {
    const user = await requireUser();
    const data = await getTransferBudgets(user.id, year, month);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

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

export async function getCategoriesForBudgetAction(): Promise<ServerActionResult<CategoryRow[]>> {
  try {
    const user = await requireUser();
    const data = await getCategories(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function upsertBudgetAction(
  input: UpsertBudgetInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = upsertBudgetSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }
    // Ownership guard: category_id harus milik user (getCategories sudah filter user_id)
    const cats = await getCategories(user.id);
    if (!cats.some((c) => c.id === parsed.data.category_id)) {
      return { success: false, message: "Invalid category." };
    }
    const id = await upsertBudget(user.id, parsed.data);
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}

export async function deleteBudgetAction(
  budgetId: string
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = z.string().uuid().safeParse(budgetId);
    if (!parsed.success) return { success: false, message: "Invalid budget ID." };
    await deleteBudget(user.id, budgetId);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}

export async function getBudgetTransactionsAction(
  categoryId: string,
  year: number,
  month: number,
  type: "spending" | "earning" | "saving" | "investing" = "spending"
): Promise<ServerActionResult<BudgetTxRow[]>> {
  try {
    const user = await requireUser();
    
    if (type === "saving" || type === "investing") {
      const data = await getTransactionsForTransfer(user.id, type, year, month);
      return { success: true, data };
    }

    const parsed = z.string().uuid().safeParse(categoryId);
    if (!parsed.success) return { success: false, message: "Invalid category." };
    const data = await getTransactionsForBudget(user.id, categoryId, year, month, type);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export interface WeeklyTransactionRow {
  transaction_type: string;
  category_name: string;
  amount: number;
  transaction_date: string;
}

export async function getWeeklySpendingAction(
  year: number,
  month: number
): Promise<ServerActionResult<WeeklyTransactionRow[]>> {
  try {
    const user = await requireUser();
    const data = await getTransactionsForWeeklyBudget(user.id, year, month);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

// ── Category Management Actions ─────────────────────────────────────────────

export async function getManageCategoriesAction(): Promise<ServerActionResult<ManageCategoryRow[]>> {
  try {
    const user = await requireUser();
    const data = await getManageCategories(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function upsertCategoryAction(
  input: UpsertCategoryInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = upsertCategorySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, name, group_name } = parsed.data;
    if (id) {
      await updateCategory(user.id, id, { name, group_name });
      return { success: true, data: { id } };
    }
    const created = await createCategory(user.id, { name, group_name });
    return { success: true, data: created };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}

export async function deleteCategoryAction(id: string): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    await softDeleteCategory(user.id, id);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}

export async function renameCategoryGroupAction(
  oldGroupName: string,
  newGroupName: string
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const oldName = oldGroupName.trim();
    const newName = newGroupName.trim();
    
    if (!oldName || !newName) {
      return { success: false, message: "Invalid group name." };
    }
    
    await renameCategoryGroup(user.id, oldName, newName);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}
