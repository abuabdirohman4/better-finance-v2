"use server";

import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import {
  getGoals,
  createGoal,
  updateGoal,
  softDeleteGoal,
  getGoalLedger,
  type GoalLedgerRow,
  type GoalRow,
} from "@/db/queries/goals";
import { createGoalSchema, updateGoalSchema, type CreateGoalInput, type UpdateGoalInput } from "@/lib/schemas/goal";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

export async function getGoalsAction(): Promise<ServerActionResult<GoalRow[]>> {
  try {
    const user = await requireUser();
    const data = await getGoals(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function createGoalAction(
  input: CreateGoalInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = createGoalSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const id = await createGoal(user.id, parsed.data);
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}

export async function updateGoalAction(
  goalId: string,
  input: UpdateGoalInput
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    
    const parsedId = z.string().uuid().safeParse(goalId);
    if (!parsedId.success) return { success: false, message: (await getTranslations("goals"))("invalidId") };

    const parsed = updateGoalSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    await updateGoal(user.id, goalId, parsed.data);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}

export async function deleteGoalAction(
  goalId: string
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = z.string().uuid().safeParse(goalId);
    if (!parsed.success) return { success: false, message: (await getTranslations("goals"))("invalidId") };
    
    await softDeleteGoal(user.id, goalId);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}

export async function getGoalLedgerAction(
  goalId: string,
  year?: number,
  month?: number
): Promise<ServerActionResult<GoalLedgerRow[]>> {
  try {
    const user = await requireUser();
    const parsed = z.string().uuid().safeParse(goalId);
    if (!parsed.success) return { success: false, message: (await getTranslations("goals"))("invalidId") };
    const period = z
      .object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) })
      .safeParse({ year, month });
    const data = await getGoalLedger(user.id, goalId, period.success ? period.data : undefined);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}
