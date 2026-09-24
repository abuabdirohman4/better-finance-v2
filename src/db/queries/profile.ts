import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";

export async function getUserProfile(userId: string) {
  const [row] = await db
    .select({ display_name: userProfiles.display_name, plan_tier: userProfiles.plan_tier })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return row ?? null;
}

/** Returns false when no profile row exists for this user. */
export async function updateDisplayName(userId: string, displayName: string): Promise<boolean> {
  const rows = await db
    .update(userProfiles)
    .set({ display_name: displayName, updated_at: new Date() })
    .where(eq(userProfiles.id, userId))
    .returning({ id: userProfiles.id });
  return rows.length > 0;
}
