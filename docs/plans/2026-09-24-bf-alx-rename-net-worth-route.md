# bf-alx: rename route `/assets` → `/net-worth`

Mechanical route rename. No behavior change. Do NOT touch `asset_category`,
`getAssets`, `useAssets`, `AssetRow`, `InvestmentGroupRow`, `assetKeys`,
`src/db/queries/assets.ts`, `src/lib/investment.ts`, or the i18n namespace
`useTranslations("assets")` — none of those are routes, all stay as-is.

## 1. Move the folder (git mv, preserves history)

```bash
git mv "src/app/(app)/assets" "src/app/(app)/net-worth"
```

This moves in one shot:
- `src/app/(app)/assets/page.tsx` → `src/app/(app)/net-worth/page.tsx`
- `src/app/(app)/assets/actions.ts` → `src/app/(app)/net-worth/actions.ts`
- `src/app/(app)/assets/[group]/page.tsx` → `src/app/(app)/net-worth/[group]/page.tsx`
- `src/app/(app)/assets/_hooks/useAssets.ts` → `src/app/(app)/net-worth/_hooks/useAssets.ts`
- `src/app/(app)/assets/_components/` (empty dir, no files, nothing to update inside)

**No import edits needed inside the moved files.** Checked every import in
`page.tsx`, `actions.ts`, `[group]/page.tsx`, `useAssets.ts` — all
cross-references inside the folder are relative (`"./_hooks/useAssets"`,
`"../_hooks/useAssets"`, `"../actions"`) and stay correct after a directory
rename. No file anywhere else imports from `@/app/(app)/assets/...` (grepped
`app/(app)/assets` repo-wide — zero hits). `src/db/queries/assets.ts` does not
move (it's outside the route folder, name unrelated to the route).

## 2. Edit hrefs / router.push (after the move, edit at new path)

### `src/app/(app)/net-worth/page.tsx`
Line 145:
```diff
-      href={`/assets/${encodeURIComponent(group.key)}`}
+      href={`/net-worth/${encodeURIComponent(group.key)}`}
```

### `src/app/(app)/net-worth/[group]/page.tsx`
Line 48:
```diff
-              href="/assets"
+              href="/net-worth"
```
Line 79:
```diff
-            <Link href="/assets" className="text-blue-600 text-sm font-semibold mt-2 inline-block">
+            <Link href="/net-worth" className="text-blue-600 text-sm font-semibold mt-2 inline-block">
```

### `src/app/(app)/accounts/page.tsx`
Line 48:
```diff
-    // Non-liquid accounts live on /assets, so send the user there after creating one.
+    // Non-liquid accounts live on /net-worth, so send the user there after creating one.
```
Line 49:
```diff
-    if (assetCategory && assetCategory !== "liquid") router.push("/assets");
+    if (assetCategory && assetCategory !== "liquid") router.push("/net-worth");
```
Line 52:
```diff
-  // /accounts shows liquid accounts only; non-liquid (investment) lives on /assets.
+  // /accounts shows liquid accounts only; non-liquid (investment) lives on /net-worth.
```
Line 54:
```diff
-  // Liabilities shown in grid but excluded from total (they reduce net worth, shown on /assets)
+  // Liabilities shown in grid but excluded from total (they reduce net worth, shown on /net-worth)
```

### `src/app/(app)/page.tsx`
Line 68:
```diff
-        <Link href="/assets" className="block bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow group">
+        <Link href="/net-worth" className="block bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow group">
```

## 3. No changes needed (checked, don't touch)

- `src/lib/supabase/middleware.ts` — `publicPaths` only lists `/signin`,
  `/signup`, `/auth/callback`. No `/assets` entry, nothing to update.
- `public/manifest.json` — `shortcuts` list `/`, `/transactions`, `/budgets`,
  `/goals`, `/accounts`. No `/assets` shortcut exists.
- `src/components/layouts/BottomNav.tsx` — nav items are home/transactions/
  budgets/goals/wishlist. No `/assets` link.
- No Playwright config or `.spec.ts` files exist in the repo (checked full
  tree) despite the `test:e2e` script in `package.json` — nothing to update.
- `src/i18n/messages/{en,id}.json` namespace `"assets"` (used via
  `useTranslations("assets")`) — leave alone, it's a translation namespace
  name, not a route.

## 4. `next.config.ts` — add redirects for old bookmarks/PWA links

Current file:
```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default withNextIntl(nextConfig);
```

Replace with (adds `async redirects()`, everything else unchanged):
```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  async redirects() {
    return [
      { source: "/assets", destination: "/net-worth", permanent: true },
      { source: "/assets/:path*", destination: "/net-worth/:path*", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
```
`:path*` covers `/assets/[group]` (e.g. `/assets/Emas` → `/net-worth/Emas`).
`permanent: true` = HTTP 308, correct for old bookmarks/PWA shortcuts that
should stop pointing at the dead path.

## 5. Docs — `AGENTS.md`

Line 149:
```diff
-- **investment** = non-liquid → TIDAK muncul di `/accounts`, hanya kartu per-akun di Net Worth (`/assets`). Buat akun investment dari `/accounts` → redirect ke `/assets` setelah save.
+- **investment** = non-liquid → TIDAK muncul di `/accounts`, hanya kartu per-akun di Net Worth (`/net-worth`). Buat akun investment dari `/accounts` → redirect ke `/net-worth` setelah save.
```

Line 164:
```diff
-`accounts` · `assets` (Net Worth) + `assets/[group]` (detail sub-produk investasi) · `budgets` · `goals` · `settings` · `transactions` · `wishlist`. Semua ikut Page Pattern di atas.
+`accounts` · `net-worth` (Net Worth) + `net-worth/[group]` (detail sub-produk investasi) · `budgets` · `goals` · `settings` · `transactions` · `wishlist`. Semua ikut Page Pattern di atas.
```

Line 193:
```diff
-- `getAssets` return `investmentGroups: { key, label, total, items }[]` (key = `investment_group` ?? id akun) — agregasi sekali di query, dipakai `/assets` + `/assets/[group]`.
+- `getAssets` return `investmentGroups: { key, label, total, items }[]` (key = `investment_group` ?? id akun) — agregasi sekali di query, dipakai `/net-worth` + `/net-worth/[group]`.
```

Line 194:
```diff
-- `/assets` = kartu per grup → tap → **`/assets/[group]`** (detail sub-produk). Detail page pakai `useAssets()` yang sama + filter client — tak ada query/action/hook baru.
+- `/net-worth` = kartu per grup → tap → **`/net-worth/[group]`** (detail sub-produk). Detail page pakai `useAssets()` yang sama + filter client — tak ada query/action/hook baru.
```

Line 196 (long line, replace only the two `/assets/[group]` and one `/assets`
occurrences, rest of the line unchanged):
```diff
-- **Tracker P&L (bf-3ai):** `current_balance` = modal/setoran (dari transaksi). `current_value` + `last_valued_at` = harga pasar, **input manual** per sub-produk di `/assets/[group]` (tap baris → editor inline; `updateAccountValueAction` di `assets/actions.ts` → `updateAccountValue` query, ownership + `asset_category==="investment"` + `value>=0` divalidasi server; `null` = hapus valuasi). `AssetRow.pnl = current_value − current_balance` (null kalau belum dinilai). Grup: `totalValue = Σ(current_value ?? current_balance)`, `pnl = Σ pnl`, `valuedCount`. **Net Worth TETAP modal-based** (`current_balance`, parity spreadsheet) — market value & P&L hanya info. Auto price feed = bf-7h2 (nanti, opt-in). Kartu grup di `/assets` tampil P&L kecil hanya kalau `valuedCount > 0`.
+- **Tracker P&L (bf-3ai):** `current_balance` = modal/setoran (dari transaksi). `current_value` + `last_valued_at` = harga pasar, **input manual** per sub-produk di `/net-worth/[group]` (tap baris → editor inline; `updateAccountValueAction` di `net-worth/actions.ts` → `updateAccountValue` query, ownership + `asset_category==="investment"` + `value>=0` divalidasi server; `null` = hapus valuasi). `AssetRow.pnl = current_value − current_balance` (null kalau belum dinilai). Grup: `totalValue = Σ(current_value ?? current_balance)`, `pnl = Σ pnl`, `valuedCount`. **Net Worth TETAP modal-based** (`current_balance`, parity spreadsheet) — market value & P&L hanya info. Auto price feed = bf-7h2 (nanti, opt-in). Kartu grup di `/net-worth` tampil P&L kecil hanya kalau `valuedCount > 0`.
```
(Note: `assets/actions.ts` in that line is referring to the file's OLD
relative name for a reader's mental model of "the actions file for this
route" — since the file moved, update the text to `net-worth/actions.ts` to
match the new path.)

Lines 148, 151 mention `/accounts` and "Net Worth" prose only — no `/assets`
substring, leave untouched.

## 6. Docs — `docs/roadmap.md`

These 4 lines are the **current-state status table** (Fase A/B section
"Feature Pages" / MVP status) — describes what's true *now*, so they must
track the rename:

Line 162:
```diff
-| Net Worth | ✅ | `/assets` | Kartu Accounts agregat + non-liquid + Liabilities section (bf-9v5, bf-3e0) |
+| Net Worth | ✅ | `/net-worth` | Kartu Accounts agregat + non-liquid + Liabilities section (bf-9v5, bf-3e0) |
```
Line 166:
```diff
-| Akun non-liquid | ✅ | `/accounts` → `/assets` | Enum liquid/investment, redirect ke /assets (bf-yts) |
+| Akun non-liquid | ✅ | `/accounts` → `/net-worth` | Enum liquid/investment, redirect ke /net-worth (bf-yts) |
```
Line 167:
```diff
-| Investment sub-produk + grouping | ✅ | `/assets` + `/assets/[group]` | 1 akun per sub-produk, kartu per grup → detail (bf-z6w) |
+| Investment sub-produk + grouping | ✅ | `/net-worth` + `/net-worth/[group]` | 1 akun per sub-produk, kartu per grup → detail (bf-z6w) |
```
Line 168:
```diff
-| Investment tracker P&L | ✅ | `/assets/[group]` | current_value input manual + P&L per sub-produk (bf-3ai); auto price = bf-7h2 |
+| Investment tracker P&L | ✅ | `/net-worth/[group]` | current_value input manual + P&L per sub-produk (bf-3ai); auto price = bf-7h2 |
```

**Do NOT touch** these — they are dated changelog entries (immutable history
of what was true on that date, same convention as a git log):
lines 19, 21, 28, 105, 205, 208 (all under dated `- **2026-...**` bullets or
the Fase A/B planning table rows `bf-3ai`/`bf-m2s`/`bf-alx` describing past/
in-flight work at the time it was written). Also leave every file under
`docs/plans/*.md` and `docs/prompts/*.md` untouched — those are dated,
point-in-time execution records, not living docs.

## 7. Verification (executor runs, does not need to report back beyond pass/fail)

```bash
grep -rn "\"/assets\"\|'/assets'\|\`/assets" --include="*.ts" --include="*.tsx" src/   # expect: 0 hits
git status                                                                             # net-worth/ new, assets/ gone
```
Do NOT run `npm run dev` / `npm run build` — per AGENTS.md, leave that to the
user.

## Open questions (with recommendation)

1. **Should `docs/roadmap.md` changelog lines (19/21/28/105/205/208) be
   updated to `/net-worth` too?**
   Recommendation: **no, leave them** — they're dated history entries; the
   codebase convention (see AGENTS.md's own "dated plan files" pattern) is
   that historical records describe what was true at the time, not what's
   true now. Only the status table (section 6 above) represents current
   truth and needs to move with the code.

2. **Should the i18n namespace `useTranslations("assets")` / JSON key
   `"assets"` in `en.json`/`id.json` be renamed to `"netWorth"` for
   consistency?**
   Recommendation: **no, out of scope** — the issue says rename the *route*
   only, and the task's own warning explicitly says don't touch unrelated
   "assets" words. Renaming the i18n namespace is a separate, purely
   cosmetic follow-up with no user-facing effect (keys aren't URLs).

3. **`redirects()` `permanent: true` (308) vs `false` (307)?**
   Recommendation: **`permanent: true`** — this is a real, final route rename
   (not a temporary experiment), so browsers/PWA should cache the redirect
   and stop hitting `/assets` on every load.
