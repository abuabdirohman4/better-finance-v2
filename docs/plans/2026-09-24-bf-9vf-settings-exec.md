# bf-9vf — /settings: edit display name, privacy toggle, plan badge (exec plan)

Supersedes `docs/plans/2026-07-22-bf-9vf-settings-feature.md` (stale). Executor: Sonnet, blind. Follow literally.

## Gap analysis (what exists vs scope)

| Scope item | Status | Where |
|---|---|---|
| Profile display (avatar, name, email) | DONE | `src/app/(app)/settings/page.tsx` via `useDashboard()` |
| Sign out | DONE | `<form action={signOut}>` in settings page |
| Language switcher | DONE (bonus) | `src/components/ui/LocaleSwitcher.tsx` |
| hideBalances persisted | DONE | `src/stores/privacyStore.ts` already uses zustand `persist` (localStorage key `bf-privacy`) |
| Privacy toggle **on /settings** | MISSING | only eye-icon toggles on dashboard/accounts/net-worth/wishlist |
| Edit display name | MISSING | name is read from `user.user_metadata.full_name`, NOT `user_profiles.display_name`; no edit UI/action |
| Plan tier badge | MISSING | `user_profiles.plan_tier` exists in schema, never read |

Decision "persist hideBalances": **keep zustand persist (localStorage, per device). No migration.** Already implemented. Per-device is arguably correct (hide on phone in public, show on laptop). Add a DB column only if cross-device sync is ever requested.

## Files touched (5)

1. `src/db/queries/profile.ts` — NEW (get + update display name)
2. `src/app/(app)/actions.ts` — read profile in `getDashboard`, add `updateDisplayNameAction`
3. `src/app/(app)/settings/page.tsx` — name edit, plan badge, privacy toggle
4. `src/i18n/messages/en.json` — new `settings.*` keys
5. `src/i18n/messages/id.json` — same keys, Indonesian

No DB migration. No new hook file. No new dependency.

---

## Step 1 — `src/db/queries/profile.ts` (NEW)

```ts
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
```

## Step 2 — `src/app/(app)/actions.ts`

### 2a. Imports — BEFORE
```ts
import { getDashboardData, type DashboardData } from "@/db/queries/accounts";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
```
AFTER
```ts
import { getTranslations } from "next-intl/server";
import { getDashboardData, type DashboardData } from "@/db/queries/accounts";
import { getUserProfile, updateDisplayName } from "@/db/queries/profile";
import { requireUser } from "@/lib/accessControlServer";
import { handleApiError, type ServerActionResult } from "@/lib/errorUtils";
import type { PlanTier } from "@/lib/constants";
```

### 2b. Payload type — BEFORE
```ts
  user: { displayName: string; initials: string; email: string; avatarUrl: string | null };
```
AFTER
```ts
  user: {
    displayName: string;
    initials: string;
    email: string;
    avatarUrl: string | null;
    planTier: PlanTier;
  };
```

### 2c. Inside `getDashboard` — BEFORE
```ts
    const data = await getDashboardData(user.id);

    const displayName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
```
AFTER
```ts
    const [data, profile] = await Promise.all([getDashboardData(user.id), getUserProfile(user.id)]);

    const displayName =
      profile?.display_name?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
```
And in the returned `user: { ... }` object add after `avatarUrl,`:
```ts
          planTier: (profile?.plan_tier ?? "free") as PlanTier,
```

### 2d. New action — append after `getDashboard` (before `function initials`)
```ts
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
```
(Validation inline, not a zod schema — zod messages must stay literal English per AGENTS.md, and these must be translated.)

## Step 3 — `src/app/(app)/settings/page.tsx` (full replacement)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, Eye, EyeOff } from "lucide-react";
import { signOut } from "@/app/(auth)/signin/actions";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useDashboard } from "../_hooks/useDashboard";
import { updateDisplayNameAction } from "../actions";
import { dashboardKeys } from "@/lib/query";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/constants";

const PLAN_STYLE: Record<PlanTier, string> = {
  free: "bg-gray-100 text-gray-600",
  pro: "bg-blue-100 text-blue-700",
  family: "bg-purple-100 text-purple-700",
};

export default function SettingsPage() {
  const { data, isLoading } = useDashboard();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggleHide = usePrivacyStore((s) => s.toggleHideBalances);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const planTier = data?.user.planTier ?? "free";
  const planLabel: Record<PlanTier, string> = {
    free: t("planFree"),
    pro: t("planPro"),
    family: t("planFamily"),
  };

  function startEdit() {
    setName(data?.user.displayName ?? "");
    setError(undefined);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      const res = await updateDisplayNameAction(name);
      if (!res.success) {
        setError(res.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setEditing(false);
    });
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar
            src={data?.user.avatarUrl}
            initials={data?.user.initials ?? ".."}
            className="w-14 h-14 bg-blue-100 text-blue-700 text-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">
                {isLoading ? "..." : data?.user.displayName}
              </p>
              <span
                className={cn(
                  "shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold",
                  PLAN_STYLE[planTier]
                )}
              >
                {planLabel[planTier]}
              </span>
            </div>
            <p className="text-sm text-gray-500 truncate">{data?.user.email}</p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              disabled={isLoading}
              aria-label={t("editName")}
              className="shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100 cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {editing && (
          <div className="space-y-3">
            <Input
              id="display-name"
              label={t("displayName")}
              value={name}
              maxLength={50}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              error={error}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={isPending}
                onClick={() => setEditing(false)}
              >
                {tc("cancel")}
              </Button>
              <Button className="flex-1" disabled={isPending} onClick={save}>
                {isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{t("hideBalances")}</p>
          <p className="text-sm text-gray-500">{t("hideBalancesHint")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hideBalances}
          aria-label={t("hideBalances")}
          onClick={toggleHide}
          className={cn(
            "shrink-0 p-2 rounded-xl transition-colors cursor-pointer",
            hideBalances ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
          )}
        >
          {hideBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      <LocaleSwitcher />

      <form action={signOut}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 py-3 rounded-2xl text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
```

Notes for executor:
- Verify `Button` accepts `onClick`/`disabled`/`className` (it spreads `...props` onto `<button>`); verify `Input` accepts `error` + `label` (it does). Button default `type` — if `Button` does not set `type`, that is fine here (not inside a `<form>`).
- `cn` is in `@/lib/utils` (used by `LocaleSwitcher`).

## Step 4 — i18n keys

`src/i18n/messages/en.json`, replace the `"settings"` block:
```json
  "settings": {
    "title": "Settings",
    "language": "Language",
    "signOut": "Sign Out",
    "displayName": "Display name",
    "editName": "Edit name",
    "nameRequired": "Name is required",
    "nameTooLong": "Name must be at most {max} characters",
    "profileNotFound": "Profile not found",
    "planFree": "Free",
    "planPro": "Pro",
    "planFamily": "Family",
    "hideBalances": "Hide balances",
    "hideBalancesHint": "Mask amounts on this device"
  },
```

`src/i18n/messages/id.json`, replace the `"settings"` block:
```json
  "settings": {
    "title": "Pengaturan",
    "language": "Bahasa",
    "signOut": "Keluar",
    "displayName": "Nama tampilan",
    "editName": "Ubah nama",
    "nameRequired": "Nama wajib diisi",
    "nameTooLong": "Nama maksimal {max} karakter",
    "profileNotFound": "Profil tidak ditemukan",
    "planFree": "Free",
    "planPro": "Pro",
    "planFamily": "Family",
    "hideBalances": "Sembunyikan saldo",
    "hideBalancesHint": "Samarkan nominal di perangkat ini"
  },
```
Key sets must be identical (guarded by `src/i18n/__tests__/messages.test.ts`).

## Step 5 — Docs
- `AGENTS.md` → "Auth: Google OAuth" section: replace the Avatar/`getDashboard` line's implication — add bullet: "**Display name** = `user_profiles.display_name` (editable in `/settings`, `updateDisplayNameAction` in `(app)/actions.ts`) → fallback `user_metadata.full_name` → email prefix. `planTier` also comes from `user_profiles` via `getUserProfile` (`src/db/queries/profile.ts`)."
- `AGENTS.md` → "Privacy Mask": add "Persisted per device via zustand `persist` (localStorage `bf-privacy`); toggle also in `/settings`."
- `docs/roadmap.md`: mark bf-9vf done.

## Verification (user runs, not Claude)
```bash
npm run test:run   # messages.test.ts key parity
npm run build      # typed t() keys + PlanTier types
```
Manual: `/settings` → pencil → empty name → "Name is required"; valid name → saves, dashboard header shows new name; toggle privacy → go to `/` → balances masked; reload → still masked; switch locale `id` → labels Indonesian; plan badge shows "Free".

## Out of scope (skipped)
- DB column for hideBalances (cross-device sync) — add only if requested.
- Avatar upload, plan upgrade/Stripe flow.
