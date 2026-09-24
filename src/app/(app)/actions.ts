"use server";

import { getTranslations } from "next-intl/server";
import { getDashboardData, type DashboardData } from "@/db/queries/accounts";
import { getUserProfile, updateDisplayName } from "@/db/queries/profile";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import type { PlanTier } from "@/lib/constants";

export interface DashboardPayload extends DashboardData {
  user: {
    displayName: string;
    initials: string;
    email: string;
    avatarUrl: string | null;
    planTier: PlanTier;
  };
}

export async function getDashboard(): Promise<ServerActionResult<DashboardPayload>> {
  try {
    const user = await requireUser();
    const [data, profile] = await Promise.all([getDashboardData(user.id), getUserProfile(user.id)]);

    const displayName =
      profile?.display_name?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "User";

    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ??
      (user.user_metadata?.picture as string | undefined) ??
      null;

    return {
      success: true,
      data: {
        ...data,
        user: {
          displayName,
          initials: initials(displayName),
          email: user.email ?? "",
          avatarUrl,
          planTier: (profile?.plan_tier ?? "free") as PlanTier,
        },
      },
    };
  } catch (error) {
    const info = handleApiError(error, "loading data");
    return { success: false, message: info.message };
  }
}

const MAX_NAME = 50;

export async function updateDisplayNameAction(name: string): Promise<ServerActionResult<void>> {
  try {
    const user = await requireUser();
    const t = await getTranslations("settings");
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return { success: false, message: t("nameRequired") };
    if (trimmed.length > MAX_NAME) return { success: false, message: t("nameTooLong", { max: MAX_NAME }) };

    const ok = await updateDisplayName(user.id, trimmed);
    if (!ok) return { success: false, message: t("profileNotFound") };
    return { success: true };
  } catch (error) {
    return { success: false, message: handleApiError(error, "updating data").message };
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
