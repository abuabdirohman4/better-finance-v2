"use server";

import {
  getAccountsWithType,
  getAccountTypes,
  getAccountById,
  createAccount,
  updateAccount,
  updateRealityCheck,
  deactivateAccount,
  type AccountRow,
} from "@/db/queries/accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/schemas/account";
import { requireUser } from "@/lib/accessControlServer";
import { getTranslations } from "next-intl/server";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import { createAccountSchema, updateAccountSchema } from "@/lib/schemas/account";

export async function getAccounts(): Promise<ServerActionResult<AccountRow[]>> {
  try {
    const user = await requireUser();
    const data = await getAccountsWithType(user.id);
    return { success: true, data };
  } catch (error) {
    const info = handleApiError(error, "loading data");
    return { success: false, message: info.message };
  }
}

export async function getAccountTypesAction(): Promise<
  ServerActionResult<{ id: string; name: string; slug: string }[]>
> {
  try {
    const user = await requireUser();
    const data = await getAccountTypes(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function createAccountAction(
  input: CreateAccountInput
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const user = await requireUser();

    const parsed = createAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const types = await getAccountTypes(user.id);
    if (!types.some((type) => type.id === parsed.data.account_type_id)) {
      return { success: false, message: (await getTranslations("accounts"))("invalidAccountType") };
    }

    const id = await createAccount(user.id, parsed.data);
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}

export async function updateAccountAction(
  accountId: string,
  input: UpdateAccountInput
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();

    const parsed = updateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const t = await getTranslations("accounts");
    const account = await getAccountById(user.id, accountId);
    if (!account) return { success: false, message: t("notFound") };

    if (parsed.data.account_type_id !== undefined) {
      const types = await getAccountTypes(user.id);
      if (!types.some((type) => type.id === parsed.data.account_type_id)) {
        return { success: false, message: t("invalidAccountType") };
      }
    }

    await updateAccount(user.id, accountId, parsed.data);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}

export async function deleteAccountAction(
  accountId: string
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    await deactivateAccount(user.id, accountId);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "deleting data").message };
  }
}

export async function getAccountAction(
  accountId: string
): Promise<ServerActionResult<AccountRow>> {
  try {
    const user = await requireUser();
    const account = await getAccountById(user.id, accountId);
    if (!account) return { success: false, message: (await getTranslations("transactions"))("accountNotFound") };
    return { success: true, data: account };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

export async function updateRealityCheckAction(
  accountId: string,
  realityBalance: number
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    await updateRealityCheck(user.id, accountId, realityBalance);
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}
