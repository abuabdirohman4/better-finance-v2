"use server";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import { getAssets, type AssetsSummary } from "@/db/queries/assets";
import { getAccountById, updateAccountValue } from "@/db/queries/accounts";

export async function getAssetsAction(): Promise<ServerActionResult<AssetsSummary>> {
  try {
    const user = await requireUser();
    const data = await getAssets(user.id);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: handleApiError(error, "loading data").message };
  }
}

/** Set harga pasar manual sub-produk investasi. value null = hapus valuasi. */
export async function updateAccountValueAction(
  accountId: string,
  value: number | null
): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    // Validasi di server — form bisa di-bypass.
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return { success: false, message: "Market value must be a positive number." };
    }
    const account = await getAccountById(user.id, accountId);
    if (!account) return { success: false, message: "Account not found." };
    if (account.asset_category !== "investment") {
      return { success: false, message: "Market value only applies to investment accounts." };
    }
    await updateAccountValue(user.id, accountId, value);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, message: handleApiError(error, "saving data").message };
  }
}
