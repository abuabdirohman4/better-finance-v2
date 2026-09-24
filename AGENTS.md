<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture Patterns

## i18n: next-intl (bf-bp5)

**Semua string user-facing WAJIB lewat `t()`**, bukan literal di JSX. Locale: `en` (default) + `id`, katalog di `src/i18n/messages/<locale>.json`.

- **Client component:** `const t = useTranslations("<namespace>")` dari `next-intl`.
- **Server action / RSC:** `await getTranslations("<namespace>")` dari `next-intl/server`.
- **TANPA i18n routing** — locale dari cookie `BF_LOCALE`, bukan URL segment. Jadi TIDAK ada `app/[locale]/`; route tetap flat. Ganti locale lewat `setLocale()` (`src/i18n/actions.ts`), UI-nya `LocaleSwitcher` di `/settings`.
- **Key type-safe:** `src/global.d.ts` augment `AppConfig["Messages"]` dari `en.json` → typo di `t("...")` = build error. Tambah key ke `en.json` DULU sebelum dipakai.
- **`en.json` dan `id.json` wajib punya key identik** — dijaga unit test `src/i18n/__tests__/messages.test.ts`. Tambah key di satu file saja = test merah.
- **TETAP literal English (bukan `t()`):** zod schema messages (`src/lib/schemas/*`) + `ErrorContext` union & `getErrorMessage` fallback di `errorUtils.ts` — dipanggil di luar request context, jadi `getTranslations` tak bisa dipakai. `handleAuthError` sudah **async** + ter-translate (2 caller, keduanya server action).
- TIDAK berlaku: komentar kode, nama variabel, doc internal (plan/prompt boleh Indonesian).


> **Integrasi fitur (Goals/Assets/Transactions/Budgets):** READ `docs/architecture-integration.md` sebelum kerja di goals/assets/budget derivation — jelaskan model 1-source-of-truth (transaksi → semua view derived) + keputusan `goal_id` eksplisit.

### Data Layer (`src/db/queries/`)
Drizzle query functions — WAJIB filter `where(eq(table.user_id, userId))` di setiap query.
DB tidak RLS-aware (pakai admin credentials) — filter manual wajib, jangan rely on Supabase RLS.

### Server Actions (`src/app/(app)/**/actions.ts`)
Semua Server Actions return `ServerActionResult<T>` dari `lib/errorUtils`:
- `requireUser()` → throws jika tidak auth
- Return `{ success: true, data }` atau `{ success: false, message }`
- Wrap dengan `handleApiError(error, "context")` di catch
- **Validasi WAJIB di server, bukan hanya form.** Form bisa di-bypass (direct action call). Guard di trust boundary: amount > 0, ownership akun (`getAccountById` sebelum mutate), reject self-transfer (`account_id !== to_account_id`), field required.

### Balance Mutation
**Semua balance mutations WAJIB pakai `applyTransactionBalancesRpc`** — atomic via Postgres RPC `apply_transaction_balances`.

```ts
// Pattern wajib di semua actions yang mutate balance:
const adjustments: { account_id: string; delta: number }[] = [
  { account_id: sourceId, delta: -amount },
  { account_id: destId,   delta: +amount },  // transfer only
];
await applyTransactionBalancesRpc(user.id, adjustments);  // src/db/queries/accounts.ts
```

**WAJIB verifikasi ownership akun SEBELUM mutate** — `getAccountById(user.id, accountId)` untuk SETIAP akun yang disentuh (source + dest), termasuk saat edit ganti akun. RPC `apply_transaction_balances` juga self-guard (`WHERE user_id = p_user_id`, raise exception kalau 0 rows) sebagai lapis kedua — tapi jangan andalkan itu saja, guard di action tetap wajib.

- **Create**: earning → `+amount`, spending/transfer → `-amount`. Transfer juga `+amount` ke `to_account_id`.
- **Edit/Delete**: kumpulkan reverse lama + apply baru dalam 1 array → 1 RPC call. Lihat `transactions/actions.ts` sebagai referensi.
- `adjustAccountBalance` masih ada di query layer untuk non-transaction mutations (e.g. walletDenominations reality check) — jangan dipakai untuk transaction create/edit/delete.

### TanStack Query Hooks (`src/app/(app)/**/_hooks/`)
Hook per feature, co-located di folder feature. Query key generators di `src/lib/query.ts`.
Pattern: queryFn memanggil Server Action → throw jika `!res.success`.

### Account Visuals (`src/lib/accountVisuals.ts`)
Key = nama akun exact, case-sensitive (match `accounts.name` di DB).
`getAccountVisual(name)` → `{ initials, isWalletIcon, iconColor, iconBg, accent, text }`.
Tambah entry di `LOGOS` + `COLOR_SCHEMES` saat ada akun baru.

### Page Pattern
Semua halaman fitur: `"use client"` + TanStack Query hook. Server Actions dipanggil dari hook.
Header gradient + wave SVG: copy dari `src/app/(app)/page.tsx`.

**Tailwind v4:** Pakai `bg-linear-to-{dir}` bukan `bg-gradient-to-{dir}` (breaking change dari v3).
Pakai `shrink-0` bukan `flex-shrink-0` (v4 shorthand).
Contoh: `bg-linear-to-r from-blue-600 to-indigo-800`, `bg-linear-to-br from-gray-50 to-indigo-50`.

**Skala font Android (app-t82c986):** `<meta name="text-scale" content="scale">` di root layout +
`html { font-size: clamp(16px, 100%, 18px) }` di globals.css. Font OS user diikuti tapi dibatasi 18px.
Hindari ukuran `text-[Npx]` baru — pakai kelas rem supaya ikut skala.

**Header accounts page:** back button (`ChevronLeft w-7 h-7`) + judul sejajar horizontal, bukan stacked.
Body dimulai dengan `mt-6` (bukan `pt-2`) untuk spacing wave → content.

### Currency Formatting (`src/lib/helper.ts`)
- `formatCurrency(amount)` → `Rp 1.000.000`
- `formatCurrency(amount, "signs")` → `+Rp 1.000` / `-Rp 1.000`
- `formatCurrency(amount, "superscript")` → HTML string dengan `<sup>` → pakai `dangerouslySetInnerHTML` (Bank accounts saja)
- `formatCurrency(amount, "short")` → `1,5 jt`

### Privacy Mask
`usePrivacyStore` (Zustand) di `src/stores/privacyStore.ts` — `hideBalances: boolean`, `toggleHideBalances()`.
Semua komponen yang tampilkan saldo WAJIB cek `hideBalances`. Persisted per device via zustand `persist` (localStorage `bf-privacy`); toggle also in `/settings`.

### UI Components (`src/components/ui/`)
Reusable primitives — pakai untuk semua form, filter, button di seluruh v2.

| Component | Kapan pakai |
|---|---|
| `Button` | Semua tombol aksi. `variant="outline"` untuk secondary, `variant="ghost"` untuk subtle |
| `Input` | Text/date/email/number input dengan label + error state. Pakai ini juga untuk field custom (mis. Jumlah dual-state) biar tinggi konsisten |
| `Select` | Native dropdown — **hindari untuk form** (dropdown OS jelek, no search). Pakai `SingleSelect` |
| `SingleSelect` | Single-pick di form. Diekspor dari `MultiSelect.tsx` (wrapper tipis). Portal dropdown, searchable, optgroup |
| `MultiSelect` | Multi-select dengan searchable + checkbox. Pakai `iconPrefix` emoji untuk filter v1-style |

`MultiSelect`/`SingleSelect` prop `direction`: `"down" | "up" | "auto"` (default `"auto"` — flip otomatis kalau ruang bawah sempit). Pakai `"up"` untuk field di bagian bawah bottom sheet.

**Grup collapsible (bf-v4r):** opsi ber-`group` dirender sebagai header yang bisa dilipat (default TERLIPAT, tampil nama + count). Opsi TANPA `group` selalu di urutan pertama dan tak pernah dilipat — akun liquid tetap 1 klik. Grup otomatis terbuka kalau: sedang search, atau ada opsi terpilih di dalamnya. Search mencocokkan **label DAN nama grup** (`matchesSearch`) — wajib, karena label produk investasi dipendekkan pakai `productLabel`. Helper murni `matchesSearch` + `groupOptions` diekspor dari `MultiSelect.tsx` (ada unit test; project tak punya testing-library, jadi logika dipisah dari render).

**Reference Projects:** Lihat `docs/reference-projects.md` sebelum explore projek acuan (prj-better-finance v1, portfolio-management-service, prj-better-planner, school-management) — hemat token.

## Dokumentasi yang Wajib Di-update Tiap Sesi

Kalau sesi nambah pattern/gotcha/konvensi/command/fitur baru, WAJIB cek + update **ketiga** file ini (bukan cuma satu):

| File | Kapan update |
|---|---|
| `AGENTS.md` | Pattern arsitektur, konvensi kode, gotcha teknis, command baru |
| `CLAUDE.md` | Aturan workflow Claude, session-completion protocol |
| `README.md` | Fitur user-facing baru, cara setup/run berubah, deskripsi produk. **Sering kelupaan — cek eksplisit tiap sesi.** |
| `docs/roadmap.md` | Status fitur berubah (done/in-progress), issue baru difile, urutan kerja/MVP bergeser. **Cek eksplisit tiap sesi.** |

Claude: JANGAN cuma update AGENTS.md/CLAUDE.md lalu lupa README + roadmap. Ingatkan user + tawarkan update keduanya kalau sesi menyentuh fitur/status/setup yang bikin file itu basi.


## Implementation Workflow

**WAJIB jalankan `/new-feature-workflow` sebelum implementasi apapun** — fitur baru, bug fix, refactor, semua.

Workflow ini (diadaptasi untuk project ini, no GitHub remote):

1. **Explore** — baca file relevan, pahami context
2. **Plan file** — simpan ke `docs/plans/YYYY-MM-DD-<bf-id>-<feature>.md` (ultra-detail: path, code snippet, command exact)
3. **Beads issue** — `bd create` (kalau belum ada), lalu `/rename bf-xxx <slug>` di sesi chat
4. ~~GitHub Issue~~ — **skip** (no git remote di project ini)
5. **Prompt file** — simpan ke `docs/prompts/YYYY-MM-DD-<bf-id>-<feature>.md` (siap paste ke Antigravity)
6. **Pilih mode A (Antigravity) atau B (direct)** — threshold: >=3 files ATAU >=100 lines -> A

### Model per phase

| Phase | Model |
|---|---|
| Explore + plan (judgment, arsitektur) | **Opus** |
| Eksekusi dari plan (kode dari spec jelas) | **Sonnet** |

## Build / Test / Lint

```bash
npm run dev        # dev server (next dev)
npm run build      # production build — WAJIB lolos sebelum close issue (satu-satunya cara catch typo query/import)
npm run test:run   # vitest sekali jalan (balance math unit tests)
npm run test:e2e   # playwright
npm run lint       # tsc --noEmit (noUnusedLocals/Parameters = gerbang unused-code, app-t17ca79)
npm run format     # prettier --write
```
> Claude: JANGAN jalankan `build`/`test` sendiri (boros token) — minta user, analisa hasilnya saja.

## Asset Category (`accounts.asset_category`)

Enum: `"liquid" | "investment"` (lihat `src/lib/constants.ts`; DB CHECK constraint `accounts_asset_category_check` juga 2 nilai). Property/other DIHAPUS (2026-07-24, bf-yts) — tambah balik kalau benar butuh.
- **liquid** = uang siap pakai (Wallet, Bank, e-wallet) → muncul di halaman `/accounts`, dasar "uang bebas" wishlist + agregat kartu Accounts di Net Worth.
- **investment** = non-liquid → TIDAK muncul di `/accounts`, hanya kartu per-akun di Net Worth (`/net-worth`). Buat akun investment dari `/accounts` → redirect ke `/net-worth` setelah save.
- Non-liquid derive: filter `!== "liquid"` (bukan `=== "non-liquid"` — string itu tak pernah ada di DB). Sengaja robust kalau enum ditambah lagi.
`getAccountsWithType(userId)` return semua akun; `/accounts` page filter `=== "liquid"`, Net Worth pakai `!== "liquid"` untuk non-liquid.
- **Account type** (`account_type_id` → account_types Cash/Bank/E-wallet) = label kosmetik — editable saat edit akun (bf-7m3). Tidak ada logic yang bergantung padanya: wallet denominations ikut `is_wallet`, liquid/investment ikut `asset_category`, visual ikut nama. Server wajib cek type milik user (`getAccountTypes`) di create + update.

## Goals: `collected_amount` derived (bf-4ln)

`getGoals` (`src/db/queries/goals.ts`) hitung `collected_amount` = base kolom + Σ `transfer` ber-`goal_id` − Σ `spending` ber-`goal_id` (deleted_at NULL). Boleh negatif (P6: pemakaian > terkumpul diizinkan; `percent` di-clamp 0, GoalCard tampil merah). **Derived, bukan kolom mentah** — jangan baca `savings_goals.collected_amount` langsung untuk progress. `percent = collected/target*100`.

**Aturan tanda goal (bf-btz):** tipe transaksi menentukan arah, bukan akun. `transfer`+goal = setoran, `spending`+goal = pemakaian, `earning`+goal = DITOLAK server (`goalAllowed` di `transactions/_lib/goalRule.ts`). Spending ber-goal **dikecualikan** dari expense budget, drill-down, dan weekly (`isNull(transactions.goal_id)` di `getBudgetsWithSpending` type spending, `getTransactionsForBudget`, `getTransactionsForWeeklyBudget`); ditampilkan terpisah sebagai "Funded from goals" (`getGoalFundedSpending`). Halaman Transactions tetap arus kas mentah.

## Goal reality check (bf-kvk)

Goals page warns when an account holds less than the goal money tagged into it. **Derived, no `savings_goals.account_id`** (bf-yts: 1 goal spans many accounts). Per account: `allocated = Σ goal transfers (to_account_id) − Σ goal spending (account_id)`, active goals only; warn when `allocated − current_balance > 0.01`. Surplus never warns (free cash is normal); compares `current_balance` (modal), not `current_value`. Pure logic `buildGoalRealityCheck` in `src/lib/goalReality.ts` (unit tested), query `getGoalFlowsByAccount`.
Ceilings: goal base `collected_amount` (opening / sheet import) has no account → invisible to the check. Move-then-spend (untagged Bibit → Wallet, goal spending from Wallet) shows a shortfall on the source.

## Budget: 3 sisi (bf-yz4)

| Sisi | Target | Actual |
|---|---|---|
| Expense | `budgets` rows, group ∉ earning/saving/investing | spending `goal_id IS NULL` |
| Income | `budgets` rows, group = earning | earning |
| Saving/Investing | `savings_goals.monthly_contribution` per goal | Σ transfer ber-`goal_id` bulan itu (`getSavingBudgets`) |

Bucket Saving/Investing = Σ per `goal_type` (`buildSavingBuckets`, `budgets/_lib/savingBuckets.ts`) — derived, tidak disimpan. `budgets` rows di kategori group saving/investing TIDAK dipakai lagi (disaring dari `getBudgetsWithSpending` + picker `BudgetBottomSheet`; data lama dibiarkan). Jangan hidupkan lagi `getTransferBudgets`/`goalMap` (dihapus — dua implementasi angka yang sama). Drill goal di `/budgets` = `GoalLedger` dengan `year`/`month`.

## Wishlist Affordability (bf-ez2)

"Bisa beli" ≠ punya uang. Patokan = **uang bebas** = liquid − `allocated`, dengan `allocated` = Σ transfer ber-`goal_id` yang masuk akun liquid (`getLiquidGoalAllocated`). `goal_type` hanya `Saving | Investment` (CHECK constraint) — tidak ada tipe "emergency"; dana darurat = goal biasa bertipe `Saving`, jadi ikut terhitung lewat transfernya. 3 tingkat: 🟢 freeCash≥harga · ⚠️ liquid cukup tapi kuras alokasi · 🔴 liquid kurang. Lihat `getAffordabilityAction` di `wishlist/actions.ts`.

## Feature Pages (`src/app/(app)/`)

`accounts` · `net-worth` (Net Worth) + `net-worth/[group]` (detail sub-produk investasi) · `budgets` · `goals` · `settings` · `transactions` · `wishlist`. Semua ikut Page Pattern di atas.

### `/budgets/categories` — Manage Categories (bf-wrp)
Full CRUD halaman kelola kategori. Entry point: link "Manage Categories" di `/budgets`.

- **Soft delete**: `is_active=false` — transaksi/budget lama tetap utuh; kategori hilang dari picker.
- **Query distinction**: `getManageCategories` (grouped, buat halaman manage) vs `getCategories` (flat, buat picker transaksi/budget).
- **Grup free-text**: user pilih 6 existing groups (eating/living/saving/investing/giving/earning) atau ketik grup baru.
- **Slug**: auto-generated via `toSlug(name)` (`src/lib/slug.ts`). Unique constraint `(user_id, slug, group_name)`.


## Migrasi Sheet → DB (`scripts/migrate-sheet.ts`)

`npm run migrate -- 2026 [--dry]` — import Google Sheet 2026 ke Postgres. Idempotent via **natural-key dedup** (bukan hash).

- **Dedup**: `naturalKey(date|type|account_id|to_account_id|category_id|amount.toFixed(2)|note)`. Load existing key dari DB (SERTAKAN soft-deleted — biar dup yang sengaja dihapus tak masuk lagi). JANGAN pakai hash berbasis `month` — dulu bug: transaksi carry-over antar tab (muncul di tab Jul & Aug) hash beda → dobel. (Fixed 2026-08-16.)
- **`import_row_hash`** masih diisi (kolom ada) tapi TIDAK dipakai dedup lagi — natural-key yang otoritatif.
- **Dest sub-produk**: note tanpa kurung tapi ada `":"` (Tipe C, mis. `"Emas : Antam 1g"`) → dest = akun sub-produk penuh, BUKAN akun agregat `Emas` (bf-z6w). Akun baru yang dibuat script otomatis dapat `investment_group` via `deriveInvestmentGroup`.
- **Opening balance**: saldo awal (carry 2025) ditambal 1 transaksi `source_month='<year>-Opening'`, tanggal 1 Jan. Liquid: di-derive dari tab Summary (`Summary − mutasi`). **Aset non-liquid**: TIDAK ada di Summary → di-seed manual via SQL, hash `opening-<year>-nl-<slug>`. Task 5 delete opening **PRESERVE** `opening-<year>-nl-*` (jangan hapus seed manual aset).
- **Gotcha saldo liquid "cocok" walau ada dobel**: opening liquid = `Summary − mutasi`, jadi mutasi kelebihan (dobel) diserap opening → saldo akhir tetap match. Dobel cuma kelihatan di aset non-liquid (tak ada opening penyerap). Cek dup dgn query GROUP BY natural fields HAVING COUNT>1, pisah lintas-month (pasti bug) vs same-month (bisa sah — kategori beda, mis. "Soto 2x" Dining vs Shodaqoh).
- **Balance amount CHECK**: `amount >= 0`. Opening negatif → pakai `spending` (bukan earning amount negatif).
- **Budget (`npm run migrate -- 2026 --budgets [--dry]`, bf-noo)**: tab `📈  Budget` sheet `18ii…` (gid 1236804720) via `export?format=csv` (bukan gviz — gviz salah baca header tab ini). Hanya section Earning + Spending; Transfer skip (bf-yz4). Match kategori per section (earning vs non-saving/investing). Skip-existing (`onConflictDoNothing`), konflik dilaporkan. Ambang ≥ 10.000.

## Investment: sub-produk + grouping (bf-z6w)

**1 akun `accounts` = 1 sub-produk.** Tidak ada tabel holdings — reuse transaksi/RPC balance, opening-nl, `current_value`, `savings_goals.account_id`. Nama akun konvensi **`"<Grup> : <Produk>"`** (`Emas : Antam 1g`, `Saham : PGAS`, `RDPU : Trimegah Kas Syariah`, `BPJS : JHT`).

`accounts.investment_group` (text nullable) = grup tampilan: `Reksadana | Emas | Saham | USD | Crypto | BPJS`. **Kolom eksplisit = sumber kebenaran**; nama akun cuma default saat kosong (`deriveInvestmentGroup` di `src/lib/investment.ts` — prefix sebelum `":"`, RD* → `Reksadana`). Akun investment tanpa grup (mis. Jago) → kartu sendiri di Net Worth, key = id akun.

- `src/lib/investment.ts`: `deriveInvestmentGroup(name)` + `productLabel(name)` (`"Emas : Antam 1g"` → `"Antam 1g"`). Dipakai query layer, picker transaksi, halaman detail, migrate script.
- `getAssets` return `investmentGroups: { key, label, total, items }[]` (key = `investment_group` ?? id akun) — agregasi sekali di query, dipakai `/net-worth` + `/net-worth/[group]`.
- `/net-worth` = kartu per grup → tap → **`/net-worth/[group]`** (detail sub-produk). Detail page pakai `useAssets()` yang sama + filter client — tak ada query/action/hook baru.
- Picker transaksi (`TransactionForm`, `FilterBar`): akun investment pakai `group: investment_group` (optgroup) + label dipendekkan `productLabel`. `MultiSelect` search mencocokkan label **dan** group.
- **Tracker P&L (bf-3ai):** `current_balance` = modal/setoran (dari transaksi). `current_value` + `last_valued_at` = harga pasar, **input manual** per sub-produk di `/net-worth/[group]` (tap baris → editor inline; `updateAccountValueAction` di `net-worth/actions.ts` → `updateAccountValue` query, ownership + `asset_category==="investment"` + `value>=0` divalidasi server; `null` = hapus valuasi). `AssetRow.pnl = current_value − current_balance` (null kalau belum dinilai). Grup: `totalValue = Σ(current_value ?? current_balance)`, `pnl = Σ pnl`, `valuedCount`. **Net Worth TETAP modal-based** (`current_balance`, parity spreadsheet) — market value & P&L hanya info. Auto price feed = bf-7h2 (nanti, opt-in). Kartu grup di `/net-worth` tampil P&L kecil hanya kalau `valuedCount > 0`.
- Split akun agregat (Emas 1 → 7, Saham 1 → 3, 2026-08-18): row agregat di-**rename** jadi sub terbesar (bukan dinonaktifkan → tak ada akun zombie), sisanya insert baru, opening `opening-2026-nl-<slug-sub>` per sub, opening agregat lama dihapus. Σ per grup tetap → Net Worth tak berubah.

## Debts: AP/AR (bf-13t)

**`debts` = metadata only** (direction `receivable|payable`, counterparty, ledger `account_id`, `opening_amount`, due_date, note, `archived_at`). Money moves as ordinary **transfers tagged `transactions.debt_id`** between a cash account and the debt's **ledger** account (AR, AP, credit card). Same pattern as `goal_id`. `outstanding`/`status` are **derived** (`src/lib/debt.ts`, unit-tested), never stored.

- Ledger direction comes from the account: `is_liability` → payable, else receivable. The server rejects a mismatch at create. `direction` + `account_id` can't be changed after create.
- Legs (`movementLegs`): lend / repay = cash → ledger; collect / borrow = ledger → cash. Only via `recordDebtMovementAction` / `createDebtAction`, both of which go through `applyTransactionBalancesRpc`.
- `opening_amount` = part of the debt **already in the ledger balance** (legacy import). A new debt with "money moves now" off does NOT touch balances or Net Worth.
- `/debts` "Untracked" = ledger owed − Σ outstanding of active debts (legacy AR balance not yet split per person). Archiving a debt with a remainder moves it into Untracked.
- Tagging from `TransactionForm`: transfer only, must touch the ledger, never together with `goal_id` (`checkDebtTag` + DB CHECK `transactions_goal_debt_exclusive`).
- **Liability sign = natural**: a liability balance is **negative when owed**. `netWorth = Σ current_balance`. `totalLiabilities` in `getAssets` is the positive "owed" number for display only. Don't reintroduce "subtract a positive liability".
- AR is `asset_category = 'investment'` (not spendable → out of `/accounts` + wishlist free cash). AP stays liquid + `is_liability`.
- Gotcha: `npm run migrate` overwrites AR/AP `current_balance` with the sheet Summary. Re-running it after debts are tracked desyncs outstanding from the ledger.
- Entry point: link card on `/net-worth` (BottomNav is full at 5 items).

## Auth: Google OAuth (bf-y6o)

Email/password + **Google OAuth** (`signInWithOAuth`, PKCE via `@supabase/ssr`). Flow: `signInWithGoogle` server action (`signin/actions.ts`) → redirect Google consent → `/auth/callback` (`exchangeCodeForSession`, shared dgn email verification) → `/`.

- **Middleware allowlist** (`src/lib/supabase/middleware.ts`): `publicPaths = ["/signin", "/signup", "/auth/callback"]` — path baru yang harus bisa diakses tanpa session WAJIB ditambah ke array ini.
- `GoogleButton` shared di `src/app/(auth)/_components/` — dipakai signin + signup.
- Signin page baca `?message=` (error dari callback/OAuth) via `useSearchParams` — page di-wrap `<Suspense>`.
- **Trigger `handle_new_user`** (auth.users → user_profiles) kini terdokumentasi di `supabase/migrations/20260820_handle_new_user_avatar.sql` — copy `full_name` + `avatar_url` dari `raw_user_meta_data`.
- Setup provider = manual di Google Cloud Console + Supabase Dashboard (lihat plan bf-y6o).
- **Sign out**: `signOut` server action (`signin/actions.ts`) dipanggil via `<form action={signOut}>` di `/settings` — bukan onClick handler.
- **Avatar**: `Avatar` (`src/components/ui/Avatar.tsx`) — foto Google dgn fallback inisial (juga saat `onError` load gagal). Sumber `avatarUrl` = `user.user_metadata.avatar_url ?? picture` di `getDashboard` (`(app)/actions.ts`), BUKAN query tabel. Pakai `<img>` biasa + `referrerPolicy="no-referrer"` (host `googleusercontent.com` belum di-allowlist `next/image`).
- **Header dashboard** tampilkan nama + email (dulu hardcoded "Software Engineer"). Tidak ada kolom title/bio di DB.
- **Display name** = `user_profiles.display_name` (editable in `/settings`, `updateDisplayNameAction` in `(app)/actions.ts`) → fallback `user_metadata.full_name` → email prefix. `planTier` also comes from `user_profiles` via `getUserProfile` (`src/db/queries/profile.ts`).
