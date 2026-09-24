# 🗺️ Roadmap: Better Finance v2

> **File ini = peta arah produk.** Sumber tunggal visi + status fitur + next up.
> Diperbarui: 2026-09-24 · Fase: **A (investasi) aktif.** MVP ✅ · P2 ✅ · z6w ✅ · Peta A→E di bawah. Target: ganti spreadsheet, pakai harian.

---

## 🔜 Kerjaan Aktif — Per Fase (dipetakan 2026-08-19)

> **Ini satu-satunya tabel yang perlu dibaca buat "kerjakan apa selanjutnya".** Kerjakan fase berurutan; di dalam fase, baris atas dulu.
> Plan + prompt di `docs/plans/` + `docs/prompts/`. Peta lengkap + alasan urutan: `docs/plans/2026-08-19-roadmap-peta-fase-a-e.md`.
>
> **Arah:** target user = **ganti spreadsheet, pakai app harian secepatnya** → integritas data + input harian dulu, historis & landing belakangan. Suatu titik `pnpm migrate` berhenti (cutover, bf-udk) → app jadi sumber kebenaran.

### Fase A — Investasi tuntas · Claude direct

| # | Issue | Eksekutor · Sesi | Catatan |
|---|---|---|---|
| A1 | `bf-3ai` | ✅ 2026-08-19 | current_value input manual + P&L per sub-produk di `/assets/[group]`. Data diisi user sendiri (belum). Net Worth tetap modal-based |
| A2 | `bf-aq8` | ✅ closed | ter-cover z6w+3ai |
| A3 | `bf-m2s` | Antigravity (plan Claude) | Add product di `/assets/[group]`, field Group → SingleSelect existing + new |
| A4 | `bf-z65` | Claude · `bf-z65 bugfix-audit-reksadana` | Audit 2 jalur (mutasi Bibit ada / cuma saldo). Hipotesis: penarikan dari reksadana tak tercatat (0 transfer keluar 2026). **Setelah bf-dac** |

### Fase B — Input harian nyaman · Antigravity paralel, Claude review batch

| # | Issue | Files | Review batch | Catatan |
|---|---|---|---|---|
| B0 | `bf-alx` | mekanis | gabung B1 | rename `/assets` → `/net-worth`. **Sebelum dac**, setelah Fase A (3ai sentuh `/assets`) |
| B1 | `bf-dac` | 5 | `review-accounts-ux` | account detail → list transaksi; universal (AR/AP, sub-produk). Prasyarat z65 + cutover |
| B1 | `bf-uaw` | 3 | ↑ | sort order akun |
| B2 | `bf-6rl` | 7 | `review-goals-budget` | goal.account_id + pre-fill. **Cek plan vs model sub-produk** (goal per produk = account_id ke sub-akun) |
| B2 | `bf-ayj` | 5 | ↑ | budget_period (gaji tgl 25 → bulan depan). **Validasi plan lama dulu** |
| B3 | `bf-9vf` | 5 | `review-settings` | settings + privacy persist. Cek plan 07-22 masih valid |
| B3 | `bf-7m3` | 1-2 | gabung mana saja | edit tipe akun; plan docs/plans/2026-09-24-bf-7m3-edit-account-type.md |

### Fase C — Cutover: berhenti spreadsheet

| # | Issue | Eksekutor | Catatan |
|---|---|---|---|
| C1 | `bf-atf` | brainstorm Claude → Antigravity | alur tarik/jual investasi: auto-split transfer (modal) + earning/spending (untung/rugi). Depends 3ai |
| C2 | `bf-udk` | Claude interaktif | cutover checklist: migrate final → reconcile semua akun → opening statis → freeze sheet. Depends z65, dac |
| C3 | `bf-kvk` | Antigravity | goal reality check. Depends 6rl |
| C4 | `bf-7h2` | Claude plan → Antigravity | auto price feed opt-in (quantity + price_symbol → refresh). Cuma ~6/24 produk punya harga publik; manual (3ai) tetap fallback. Setelah cutover |

### Fase D — Historis + insight · Claude interaktif

| # | Issue | Catatan |
|---|---|---|
| D1 | `bf-noo` | import budget historis, 1 script, plan ✅ |
| D2 | `bf-4m1` | import 2025 (AKTIVA/PASIVA), plan ✅. Non-liquid → `opening-2025-nl-*` per sub-produk |
| D3 | `bf-gv5` | CFP insights — **brainstorm** (AI vs rule-based). Depends 4m1 |

### Fase E — Publik · Antigravity

| # | Issue | Catatan |
|---|---|---|
| E1 | `bf-8ph` | onboarding + empty state user baru — **brainstorm scope**. Wajib sebelum landing |
| E2 | ~~`bf-bp5`~~ | ✅ **DONE** — next-intl terpasang (no URL routing, cookie `BF_LOCALE`), en+id catalog, LocaleSwitcher di /settings |
| E3 | `bf-lp4` | cursor-pointer polish |
| E4 | `bf-qxb` | UI kit lengkap — **on-demand**, jangan sekaligus |
| E5 | `bf-3mb` | landing — plan+prompt ✅. Depends 8ph. **Terakhir** |
| E6 | `bf-xd4` | README tulis ulang |

### 🧠 Topik brainstorm (`superpowers:brainstorming` saat sampai)
1. bf-atf withdraw flow — kategori realized gain/loss, partial withdraw, efek goal collected
2. bf-z65 root cause — setelah data Bibit / list transaksi per akun (dac)
3. bf-8ph onboarding — minimal vs wizard
4. bf-gv5 CFP — apa yang dihitung, AI atau rule-based dulu
5. bf-ayj — validasi plan lama sebelum Antigravity

### 🧊 Deferred (sengaja tak jadi issue)
Riwayat current_value (reuse `account_balance_snapshots` kalau perlu grafik) · Emas berat/karat, multi-lot · reorder/collapse grup Net Worth.

---

## ✅ Selesai — Perjalanan Aplikasi

> Arsip kronologis. Buat referensi — bukan "kerjakan apa" (itu tabel atas).

### Phase 1–3 — Fondasi

- [x] Scaffold Next.js 16 + React 19 + TS strict + Tailwind v4
- [x] Supabase auth 3-tier (client/server/proxy) + signin/signup + auth callback
- [x] 11 tabel schema.ts + Drizzle + balance atomic RPC + IDOR patch (bf-ay8)
- [x] Dashboard read-only + accounts preview + privacy toggle (Zustand)

### Phase 4 Core — Feature Parity v1

- [x] Dashboard, Accounts (CRUD + balancing + wallet denominations)
- [x] Transactions (list, filter, CRUD, transfer, soft-delete)
- [x] Budgets monthly (CRUD + progress bar) + weekly cascade (bf-9qc)
- [x] Goals (CRUD + goal_id + collected derived — bf-4ln)
- [x] Net Worth layout v1 (kartu Accounts agregat + non-liquid per akun — bf-9v5)
- [x] Wishlist (CRUD + promote→goal + affordability — bf-ez2)
- [x] UI kit minimal (Button, Input, Select, MultiSelect, SingleSelect)

### MVP — Jalur ke Migrasi Data

- [x] `bf-yts` — Akun non-liquid + transfer 2-field + goal collected derived + Net Worth non-liquid
- [x] `bf-wrp` — Kategori management (add/edit/soft-delete, `/budgets/categories`)
- [x] `bf-bwh` — 🎯 **MVP selesai.** Import 2026: 2504 tx, 11/11 saldo match. Script `scripts/migrate-sheet.ts`

### Post-MVP Batch P2

- [x] `bf-3e0` — AR/AP liability: is_liability flag, AP kurangi net worth, section Liabilities di /assets
- [x] `bf-4z1` — Income budget: section Budget Earning di halaman budget
- [x] `bf-btz` — Goal usage ledger: spending ber-goal_id kurangi collected, GoalLedger component
- [x] `bf-z8z` — Budget drill-down: tap kategori → list transaksi
- [x] `bf-i6e` — Budget Transfers: 2 aggregate bucket Saving/Investing — **digantikan bf-yz4 (2026-09-24): target per goal dari monthly_contribution**
- [x] `bf-yz4` — Saving budget per goal (target = monthly_contribution, bucket Saving/Investing derived)
- [x] `bf-btz` — Goal-funded spending tersimpan + dikecualikan dari expense budget ("Funded from goals")

---

## 📅 Timeline

| Tanggal | Milestone | Catatan |
|---|---|---|
| 2026-07-22 | Phase 4 core selesai | Semua fitur utama + P1 bugs closed |
| 2026-07-23–25 | bf-yts + bf-wrp | Non-liquid, kategori management |
| 2026-08-11 | **bf-bwh — MVP ✅** | 2504 tx 2026 imported, 11/11 saldo match |
| 2026-08-11 | P2 batch selesai | bf-3e0, bf-4z1, bf-btz, bf-z8z, bf-i6e — 5 issue 1 hari |
| 2026-08-11 | P3 planned | 8 issue di-plan+beads+prompt, 4 migration applied via MCP |
| 2026-08-12 | P3 aktif | bf-z6w next |
| 2026-08-18 | **bf-z6w ✅** | Sub-produk Emas 7 + Saham 3, grouping Net Worth, Net Worth tetap 50.831.765 |
| 2026-08-19 | Peta A–E | 20 issue → 5 fase; 4 issue baru; arah: ganti spreadsheet |

---

## 🗂️ Manajemen Sesi (Claude)

Eksekusi kode = Antigravity. Claude = plan + review + diskusi. Sesi dikelompokkan by **tipe kerja**.

| Tipe sesi | Untuk | Naming | Batch |
|---|---|---|---|
| **plan** | Diskusi ide + bikin beads + plan + prompt | `bf-<id> plan-<slug>` | ✅ banyak plan/sesi |
| **review** | Review hasil Antigravity → fix → close → commit | `bf-<id> review-<slug>` | ✅ 2-4 issue kecil |
| **bugfix** | Debug error/regresi runtime | `bf-<id> bugfix-<slug>` | ❌ fokus 1 |
| **discuss** | Diskusi global / roadmap / arah produk | `bf discuss-<topik>` | — |

**Alur per issue:** Antigravity eksekusi (paste prompt) → sesi Claude baru → review → commit → `bd close`.

---

## 📊 Status Fitur

Legenda: ✅ done · 🔄 sebagian · ⏳ belum

| Fitur | Status | Route | Catatan |
|---|---|---|---|
| Scaffold + config | ✅ | — | Next 16 + Drizzle + TanStack + Supabase auth |
| Auth (signin/signup) | ✅ | `/signin`, `/signup` | Server Actions + `useActionState` + Google OAuth (bf-y6o) |
| Dashboard | ✅ | `/dashboard` | Summary cards + accounts preview + privacy toggle (pindah dari `/` untuk landing) |
| Accounts — list + CRUD | ✅ | `/accounts` | Bottom sheet create/edit/delete; balance auto-update |
| Accounts — balancing | ✅ | `/accounts/[id]` | Reality check + wallet denominations |
| Transactions — list + filter | ✅ | `/transactions` | Grouped by date, month+year picker, filter panel |
| Transactions — CRUD + transfer | ✅ | `/transactions` | Balance reversal on edit/delete; transfer 2-field |
| Budgets — monthly | ✅ | `/budgets` | CRUD + progress bar |
| Budgets — weekly cascade | ✅ | `/budgets/weekly` | Cascade algorithm (bf-9qc) |
| Budgets — kategori management | ✅ | `/budgets/categories` | Add/edit/soft-delete, custom group (bf-wrp) |
| Budgets — drill-down + transfers | ✅ | `/budgets` | Tap kategori → transaksi; Saving/Investing per goal (bf-z8z, bf-yz4) |
| Goals — CRUD + integrasi | ✅ | `/goals` | goal_id di transaksi, collected derived (bf-4ln) |
| Goals — usage ledger | ✅ | `/goals` | Spending ber-goal_id, GoalLedger component (bf-btz) |
| Net Worth | ✅ | `/net-worth` | Kartu Accounts agregat + non-liquid + Liabilities section (bf-9v5, bf-3e0) |
| Debts (AP/AR) | ✅ | `/debts` | Tabel `debts` + `transactions.debt_id`, outstanding derived, tanda liabilitas natural (bf-13t) |
| Wishlist | ✅ | `/wishlist` | CRUD + promote→goal + affordability (bf-ez2) |
| UI kit — minimal | ✅ | `src/components/ui/` | Button, Input, Select, MultiSelect, SingleSelect |
| UI kit — lengkap | 🔄 | `src/components/ui/` | ConfirmDialog ✅; sisa: Toast, DatePicker, dll (bf-qxb) |
| Akun non-liquid | ✅ | `/accounts` → `/net-worth` | Enum liquid/investment, redirect ke /net-worth (bf-yts) |
| Investment sub-produk + grouping | ✅ | `/net-worth` + `/net-worth/[group]` | 1 akun per sub-produk, kartu per grup → detail (bf-z6w) |
| Investment tracker P&L | ✅ | `/net-worth/[group]` | current_value input manual + P&L per sub-produk (bf-3ai); auto price = bf-7h2 |
| Goal account linkage | ⏳ | `/goals` | "disimpan di X" + pre-fill transfer (bf-6rl) |
| Account detail | ⏳ | `/accounts/[id]` | Klik akun → list transaksi (bf-dac) |
| Settings | ⏳ | `/settings` | Profil, theme, privacy (bf-9vf) |
| Landing page | ⏳ | `/` (publik) | Persona: perencana serius · diferensiasi: net worth utuh · CTA: gratis → signup (bf-3mb) |
| PWA | 🔄 | — | Manifest + globals ada; service worker belum |
| Tests | 🔄 | — | Vitest unit: calcUpdateDeltas ✅; Playwright E2E belum |

---

## 🎯 Visi

**Better Finance v2** = aplikasi tracking keuangan pribadi mobile-first (PWA), penerus v1 (Google Sheets read-only). Multi-user via Supabase, read+write, siap dikomersilkan (tier free/pro/family).

Target: akun, transaksi, budget bulanan+mingguan, goals, aset. AI insights & subscription disiapkan di schema, diaktifkan nanti.

---

## 🛠️ Tech Stack

| Layer | Pilihan |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript strict |
| Auth | `@supabase/ssr` (client/server/proxy 3-tier) |
| Data layer | Server Actions + Drizzle (query di server → tekan egress) |
| Server state | TanStack Query v5 (`refetchOnWindowFocus: false`) |
| UI state | Zustand (theme, privacy) |
| Styling | Tailwind v4 (mobile-first, `max-w-md`, bottom nav) |
| DB | Supabase Postgres 17 |
| Test | Vitest + Playwright |

> Schema: 11 tabel di `src/db/schema.ts`. Fitur baru = query + UI, tidak perlu migrasi schema baru (kecuali tercatat di issue).

---

## 📜 Changelog

- **2026-09-24** — **bf-13t AP/AR.** Tabel `debts` (metadata) + `transactions.debt_id`; bayar/tagih = transfer ber-tag lewat RPC; outstanding/status derived. Kategori AP/AR pensiun (seed + constants). AR pindah ke non-liquid. Net Worth = Σ saldo (liabilitas negatif saat berutang). Halaman `/debts` dari `/net-worth`.
- **2026-09-24** — **bf-yz4 closed.** Saving/Investing budget diganti target per goal: `savings_goals.monthly_contribution` (bukan `budgets` rows saving/investing yang dihapus dari expense). Bucket Saving/Investing = Σ per `goal_type` (`buildSavingBuckets`), drill goal = `GoalLedger` bulan berjalan. Menggantikan bf-i6e (aggregate bucket). `getTransferBudgets`/`goalMap` dihapus.
- **2026-08-19** — **bf-3ai closed** (input manual current_value di `/assets/[group]`, P&L per produk + grup, kartu grup tampil P&L; Net Worth tetap modal). **bf-aq8 closed** (ter-cover). Issue baru bf-7h2 auto price feed (Fase C4).
- **2026-08-19** — **Peta roadmap A–E.** Sesi planning Fable: 20 issue dipetakan 5 fase (A investasi → B input harian → C cutover → D historis → E publik). Keputusan: target ganti spreadsheet secepatnya; landing setelah onboarding; Antigravity paralel utk plan siap. 4 issue baru: bf-atf (tarik/jual investasi), bf-udk (cutover checklist), bf-8ph (onboarding user baru), bf-xd4 (README). Deps ditambah (z65←dac, udk←z65+dac, kvk←6rl, 3mb←8ph, aq8←3ai, gv5←4m1). bf-z6w closed.
- **2026-08-19** — **bf-v4r closed.** Dropdown akun: grup collapsible (default terlipat, opsi tanpa grup selalu di atas & tak dilipat). Search tembus grup terlipat + cocokkan nama grup. Issue baru: bf-m2s (alur tambah produk investasi — daftar sub-produk sekarang cuma ada karena import, user baru kosong).
- **2026-08-18** — **bf-z6w closed.** Model sub-produk: 1 akun per produk + `investment_group` (bukan tabel holdings). Emas 1 akun → 7 sub, Saham 1 → 3, Crypto rename `Crypto : Bitcoin`. `/assets` kartu per grup (17 → 7 kartu) → route baru `/assets/[group]` detail sub-produk. Picker transaksi optgroup. Migrate Tipe C dest per sub-produk. Helper `src/lib/investment.ts`. Net Worth tak berubah: 50.831.765,27.

- **2026-08-16** — Planning bf-3mb: landing page net-worth positioning. Plan + prompt + beads di-create. Positioning: persona=individu perencana serius, diferensiasi=net worth utuh, visual=Ink & Paper (biru/indigo), harga=gratis dulu, signature=NetWorthDemo interaktif. Dashboard dipindah `/` → `/dashboard`. Siap eksekusi Antigravity.
- **2026-08-12** — Roadmap update: tambah Timeline, parkiran jadi tabel terstruktur, hapus duplikat changelog, Status Fitur sinkron P2+P3.
- **2026-08-11** — bf-yz4 redesign jadi 2 issue: bf-i6e (Budget Transfers aggregate Saving/Investing) + bf-z8z (budget drill-down). bf-i6e + bf-z8z closed. bf-noo + bf-4m1 turun ke Parkiran.
- **2026-08-11** — P3 planning batch: 8 issue di-plan+beads+prompt (bf-dac, bf-uaw, bf-6rl, bf-ayj, bf-z6w, bf-3ai, bf-noo, bf-4m1). 4 migration applied via MCP (savings_goals.account_id, transactions.budget_period, accounts.investment_group, accounts.current_value+last_valued_at). schema.ts sinkron.
- **2026-08-11** — P2 batch selesai: bf-3e0 (AR/AP liability), bf-4z1 (income budget), bf-btz (goal usage ledger) closed.
- **2026-08-11** — **bf-bwh closed — MVP selesai.** Import 2026: 2504 tx, 11/11 saldo match. AR/AP jadi akun transfer. Issue spin-off: bf-3e0, bf-dac, bf-ayj, bf-z6w, bf-3ai, bf-noo, bf-uaw. bf-13t deferred → digantikan bf-3e0.
- **2026-08-10** — Restruktur roadmap format oims. Hook git-reminder dimatikan (looping token). bf-wrp closed di beads.
- **2026-07-25** — bf-wrp done. Kategori management `/budgets/categories` (add/edit/soft-delete, custom group, slug unique).
- **2026-07-24** — bf-yts done. Akun non-liquid (enum liquid/investment), transfer 2-field, goal collected LEFT JOIN fix, /accounts liquid-only, SingleSelect, enum 4→2.
- **2026-07-23** — bf-ez2, bf-9v5, bf-4ln done. Wishlist affordability, Net Worth layout v1, goal_id + collected derived.
- **2026-07-22** — Phase 4 core selesai. P1 bugs all closed (auth callback, balance atomic RPC, zod validation, calcUpdateDeltas tests).
