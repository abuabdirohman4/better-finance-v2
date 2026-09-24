# Budget × Goal trio — desain gabungan bf-4z1 · bf-yz4 · bf-btz

**Date:** 2026-09-24
**Epic:** app-s4hm.2 (M1.2 Budget & goal)
**Status:** Design — butuh keputusan owner (bagian 5) sebelum prompt eksekusi
**Menggantikan:** plan 2026-08-11 bf-4z1 / bf-yz4 / bf-btz (+ konteks bf-6rl, bf-ayj, bf-i6e)

---

## 0. Ringkasan satu paragraf

Ketiga fitur **tidak butuh perubahan schema**. Sebagian besar plan 11 Agustus sudah
dieksekusi (commit `d9b470e`, `ff73498`, `001a56e`, `ac58593`), tapi setengah jadi:
income budget sudah jalan, goal ledger ada tapi **spending dari goal tidak bisa
disimpan** (bug form), dan saving budget punya **dua implementasi paralel** yang
salah satunya mati, plus saving/investing ikut terhitung sebagai "spending" di Overall.
Pekerjaan tersisa = merapikan + satu aturan anti double-count, bukan membangun baru.

---

## 1. Validasi plan lama vs kode sekarang

### bf-4z1 income budget — **sudah terimplementasi (d9b470e)**
| Plan bilang | Kenyataan sekarang |
|---|---|
| Tambah `type` param di `getBudgetsWithSpending` | Sudah ada (`src/db/queries/budgets.ts:54`) |
| `getIncomeBudgetsAction`, `budgetKeys.income`, `incomeQuery` | Sudah ada (`budgets/actions.ts:43`, `lib/query.ts:41`, `useBudgets.ts:28`) |
| Komponen baru `IncomeBudgetSection` | Tidak dibuat — reuse `BudgetGroup group="earning"`; `BudgetCard` punya warna earning (hijau, makin tinggi makin baik). Lebih baik dari plan. |
| Overall card hanya expense | Sebagian: filter `!== "earning"`, **tapi grup `saving`/`investing` masih ikut** (lihat bf-yz4) |
| Drill ke transaksi | Sudah (`getTransactionsForBudget` param `type`) |

Sisa dari issue: "interaksi sama net cashflow" + gaji tgl 25 untuk bulan depan (`budget_period`). Lihat keputusan P7/P8.

### bf-yz4 saving budget — **dieksekusi, lalu diganti bf-i6e, sisa dua jalur**
| Temuan | Lokasi |
|---|---|
| `getSavingBudgets` (per goal, target = `monthly_contribution`) ada tapi **tidak dipanggil siapa pun** | `src/db/queries/goals.ts:135` |
| bf-i6e mengganti ke 2 bucket agregat Saving/Investing (target = budget row di kategori virtual `Saving`/`Investment`) — `getTransferBudgets` | `budgets.ts:281` |
| `transferQuery` di-fetch tapi hasilnya **tidak dirender**; `SavingBudgetSection` di-import tapi tidak dipakai di JSX | `budgets/page.tsx:8,34` |
| Yang benar-benar tampil: `getBudgetsWithSpending` **menyuntikkan** transfer ber-goal ke baris grup `saving`/`investing` (`goalMap`) — jadi logika yang sama dihitung dua kali di dua query | `budgets.ts:94-129` |
| **Bug:** baris saving/investing dirender di bawah judul "Budget Spending" dan ikut dijumlah ke Overall `totalSpent` → nabung 2jt terbaca "belanja 2jt" | `page.tsx:44-47, 205` |
| `catMap` ambil **satu** kategori per grup; kalau user punya >1 kategori di grup saving, target bucket salah | `budgets.ts:319` |
| Issue beads masih minta **per goal** ("Dana Darurat 2jt/bln"), sedangkan implementasi aktif agregat per goal_type | — |

### bf-btz goal ledger — **setengah jadi (ff73498)**
| Temuan | Lokasi |
|---|---|
| `getGoals` sudah `base + Σtransfer − Σspending` (collected bisa turun) | `goals.ts:41-72` ✓ |
| `getGoalLedger` + `GoalLedger` + expand di `GoalCard` sudah ada | ✓ |
| **Bug kritis:** form menampilkan "From Goal" untuk spending, tapi submit mengirim `goal_id: txType === "transfer" ? goalId : null` → spending-dari-goal **tidak pernah tersimpan**. Seluruh jalur withdrawal mati. | `TransactionForm.tsx:130` |
| **Anti double-count belum ada:** spending ber-goal_id tetap dihitung di budget bulanan, drill, dan weekly | `budgets.ts:79-91, 187, 222` |
| Server tidak menolak `goal_id` pada `earning` (schema zod mengizinkan) | `transactions/actions.ts:78` |
| Ledger pakai query key `["goal-ledger", id]` di luar `goalKeys.all` → tidak ter-invalidate setelah transaksi baru | `GoalLedger.tsx:15` |
| Mutasi transaksi tidak invalidate `budgetKeys.all` → budget basi s/d 30 dtk / reload | `TransactionBottomSheet.tsx:64-67` |
| "Show history / Hide history" literal, bukan `t()` (melanggar aturan i18n) | `GoalCard.tsx:81` |
| Sub-kategori (mobil/motor) & detail pemakaian wishlist belum disentuh | — |

### Plan terkait
- **bf-6rl** (`savings_goals.account_id`): kolom ada di `schema.ts`, **nol pemakaian di kode**. Bertentangan sebagian dgn keputusan bf-yts (1 goal tersebar di banyak akun, link = `goal_id` di transaksi). Issue beads-nya sudah tidak ada.
- **bf-ayj** (`transactions.budget_period`): kolom ada di `schema.ts`, **nol pemakaian**. Issue beads-nya sudah tidak ada.
- Kedua kolom itu diterapkan via MCP 11 Agustus **tanpa file migration** di `supabase/migrations/` → repo drift dari DB.
- `scripts/migrate-sheet.ts` tidak mengisi `goal_id` pada transfer impor (walau `parseTransferNote` sudah mengekstrak nama goal). Akibat: bulan yang diimpor dari sheet menampilkan saving actual = 0. Collected tetap benar karena base `collected_amount` = snapshot sheet. **Jangan** backfill goal_id tanpa mengurangi base — itu double count.
- AGENTS.md "Wishlist Affordability" menyebut `goal_type "emergency"` — enum sebenarnya `Saving | Investment` (CHECK constraint). Dokumen basi.

---

## 2. Model gabungan (satu aturan per konsep)

```
transactions (1 source of truth)
 ├─ earning  + category(group=earning)          → Income budget actual
 ├─ spending + category, goal_id NULL           → Expense budget actual (+ weekly)
 ├─ spending + category, goal_id = G            → Goal ledger "−" (collected G turun),
 │                                                 TIDAK masuk expense budget
 └─ transfer + goal_id = G                      → Goal ledger "+" (collected G naik)
                                                   → Saving budget actual per goal
```

Aturan tanda cukup satu: **tipe transaksi menentukan arah**, bukan akun. `transfer`+goal
selalu kontribusi, `spending`+goal selalu pemakaian. Pindah uang dari Bibit ke Wallet
sebelum dipakai = transfer **tanpa** goal; spending akhirnya yang di-tag goal.

Target (sisi "budget"):

| Sisi | Target disimpan di | Actual dari |
|---|---|---|
| Expense | `budgets` (category group ≠ earning/saving/investing) | spending, `goal_id IS NULL` |
| Income | `budgets` (category group = earning) | earning per category |
| Saving/Investing | `savings_goals.monthly_contribution` per goal | transfer per `goal_id` bulan itu |

**Tidak ada kolom `kind` di `budgets`.** `categories.group_name` sudah berfungsi sebagai
kind. Saving tidak disimpan di `budgets` sama sekali — target per goal sudah punya rumah
(`monthly_contribution`, sudah ada di form goal dan diisi migrasi dari kolom Monthly sheet).
Bucket Saving/Investing = Σ per `goal_type`, derived.

Sub-kategori dalam goal (mobil/motor) = **kategori spending biasa** pada transaksi
pemakaian (mis. "Service Mobil", "Service Motor"). Ledger sudah join `categories.name`;
breakdown = group-by kategori di ledger. Nol schema.

### Schema: tidak ada migration wajib

```sql
-- Tidak ada perubahan untuk trio ini.
-- Opsional (housekeeping, keputusan T5): commit file migration untuk kolom yang
-- sudah ada di DB supaya repo tidak drift. Idempotent:
ALTER TABLE public.transactions  ADD COLUMN IF NOT EXISTS budget_period date;
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.accounts(id) ON DELETE SET NULL;
```

Schema ditolak (catat supaya tidak diusulkan ulang):
- `budgets.goal_id` / `budgets.kind` — hanya perlu kalau target per goal berubah tiap bulan (P4). YAGNI.
- `goal_sub_categories` / `parent_goal_id` — kategori spending sudah cukup (P5).

---

## 3. Per issue: file, perubahan, ukuran

### bf-btz — goal ledger + anti double-count (KERJAKAN PERTAMA)

| File | Perubahan |
|---|---|
| `transactions/_components/TransactionForm.tsx:130` | `goal_id: txType !== "earning" ? goalId \|\| null : null` (1 baris — memperbaiki bug utama) |
| `transactions/actions.ts` (create + update) | Guard: `goal_id` hanya untuk `transfer`/`spending`; earning + goal → tolak (key i18n baru `goalNotAllowed`) |
| `db/queries/budgets.ts` | Tambah `isNull(transactions.goal_id)` pada 3 query spending: `getBudgetsWithSpending` (hanya saat `type==="spending"`), `getTransactionsForBudget` (spending), `getTransactionsForWeeklyBudget` |
| `transactions/_components/TransactionBottomSheet.tsx` | `invalidateQueries({ queryKey: budgetKeys.all })` |
| `goals/_components/GoalLedger.tsx` | queryKey → `[...goalKeys.detail(goalId), "ledger"]` supaya ikut invalidasi `goalKeys.all` |
| `goals/_components/GoalCard.tsx` + `i18n/messages/{en,id}.json` | "Show/Hide history" → `t()` |
| (opsional, P8) `budgets.ts` + `budgets/page.tsx` | Satu baris di Overall card: "Funded from goals: Rp X" (Σ spending ber-goal bulan itu) |

Ukuran: 7–9 file, ~50–80 baris, nol file baru. Threshold AGENTS (≥3 file) → Mode A,
tapi semuanya mekanis; direct execution juga aman.
Cek regresi: unit test kecil untuk guard earning+goal tidak perlu — cukup build + satu
skenario manual: income 5jt, spending 4jt, spending 2jt ber-goal Dana Darurat →
Overall spending 4jt, collected Dana Darurat turun 2jt, ledger tampil −2jt.

### bf-yz4 — saving budget per goal (KEDUA)

| File | Perubahan |
|---|---|
| `db/queries/goals.ts` | `getSavingBudgets` dipakai lagi (sudah benar: target = `monthly_contribution`, actual = Σ transfer ber-goal_id bulan itu). Tambah opsional `(year, month)` ke `getGoalLedger` untuk drill per goal per bulan |
| `db/queries/budgets.ts` | **Hapus** `goalMap`/`actualGoal` dari `getBudgetsWithSpending`, **hapus** `getTransferBudgets`, `TransferBudgetRow`, `getTransactionsForTransfer` (~150 baris). Spending query mengecualikan grup `saving`/`investing` |
| `budgets/actions.ts` | `getTransferBudgetsAction` → `getSavingBudgetsAction`; `getBudgetTransactionsAction` buang cabang saving/investing |
| `budgets/_hooks/useBudgets.ts` | `transferQuery` → `savingQuery` (key `budgetKeys.saving` sudah ada) |
| `budgets/_components/SavingBudgetSection.tsx` | Tulis ulang: header bucket Saving / Investing (Σ target, Σ actual per `goal_type`) + baris per goal. Warna "makin tinggi makin baik" (reuse `getBudgetColors(…, isEarning=true)` dari `BudgetCard`) |
| `budgets/page.tsx` | Render `SavingBudgetSection` di antara Income dan Spending; `groups` + Overall mengecualikan `saving`/`investing` |
| `budgets/_components/BudgetDrillSheet.tsx` | Buang cabang `TransferBudgetRow`; tap goal → drill pakai `getGoalLedger(goalId, year, month)` atau cukup link ke `/goals` (lihat T8) |
| `i18n/messages/{en,id}.json` | Key section (bucket label, "no monthly target — set on goal") |

Ukuran: 8–9 file, +~150 / −~200 baris (net berkurang). Mode A.
Data: budget row lama di kategori virtual `Saving`/`Investment` jadi tak terpakai —
biarkan (tidak merusak), atau nonaktifkan kategori itu lagi via `/budgets/categories`.

### bf-4z1 — income budget (KETIGA: verifikasi lalu tutup)

Kode sudah ada. Yang tersisa hanya:
1. Verifikasi manual di `/budgets` bahwa target Salary vs actual tampil benar → `bd close bf-4z1`.
2. (Opsional, P8b) Kartu ringkasan "Unallocated = Income target − Expense budget − Saving target". 1–2 file, ~40 baris, direct.

---

## 4. Urutan & yang ditunda

1. **bf-btz** — memperbaiki data yang sekarang salah (budget bengkak, withdrawal tak tersimpan). Kecil. Semua yang lain membaca angka ini.
2. **bf-yz4** — menyentuh `budgets.ts` yang sama; kerjakan sesudah btz supaya filter `goal_id IS NULL` tidak ikut terhapus saat bersih-bersih. btz + yz4 boleh jadi **satu prompt Antigravity** (file overlap tinggi).
3. **bf-4z1** — tutup setelah verifikasi; kartu Unallocated opsional.

Ditunda (dengan alasan):
- **budget_period / gaji tgl 25 untuk bulan depan (ex bf-ayj)** — kolom sudah ada, butuh field form + `COALESCE` di 4 query. Tunda sampai owner merasakan income bulan salah (P7).
- **Goal ↔ akun penyimpanan default (ex bf-6rl)** — kolom ada, nol pemakaian; bf-yts sudah memutuskan goal lintas akun. Jangan bangun.
- **Target per goal yang berubah tiap bulan** (`budgets.goal_id`) — P4.
- **Detail pemakaian wishlist** (disebut di bf-btz) — wishlist yang dibeli bisa jadi spending ber-goal (`linked_goal_id` sudah ada); UI khusus tunda.
- **Backfill goal_id transaksi impor** — butuh koreksi base `collected_amount` bersamaan; bukan bagian trio.

---

## 5. Keputusan

### Preferensi produk (butuh owner)

| # | Keputusan | Rekomendasi | Alasan singkat |
|---|---|---|---|
| P1 | Spending ber-goal dikecualikan dari mana? | Dari **expense budget + weekly** saja; halaman Transactions tetap total arus kas mentah | Budget = pengeluaran dari income; daftar transaksi = rekening koran, harus jujur |
| P2 | Cara catat "pakai uang goal" | **Spending di-tag goal** (1 transaksi); transfer+goal selalu = setoran | Satu aturan tanda, tidak perlu menebak arah dari akun |
| P3 | Target bucket Saving/Investing dari mana? | **Derived Σ `monthly_contribution`** per goal_type; budget row kategori virtual Saving/Investment pensiun | Satu angka dipelihara di satu tempat (goal), tidak ada dua target yang bisa beda |
| P4 | Target per goal tetap vs bisa beda tiap bulan | **Tetap** (`monthly_contribution`) | Sheet v1 juga satu kolom Monthly; override bulanan = schema baru tanpa kebutuhan nyata |
| P5 | Sub-kategori dalam goal (mobil/motor) | **Pakai kategori spending** pada transaksi pemakaian | Nol schema; ledger sudah menampilkan kategori |
| P6 | Pemakaian > collected | **Izinkan**, collected boleh negatif, bar 0% + teks merah | Memblokir = kejadian nyata tak bisa dicatat |
| P7 | Gaji tgl 25 dihitung bulan depan (budget_period) | **Tunda** | Hanya meleset di batas bulan; biayanya form field + 4 query |
| P8 | Tampilkan "Funded from goals Rp X" di Overall budget | **Ya**, satu baris | Tanpa itu 2jt yang "hilang" dari budget terasa seperti bug |
| P8b | Kartu Unallocated (income − expense − saving target) | **Tunda / opsional** | Bagus untuk zero-based, tapi bukan inti tiga issue |

### Teknis (diputuskan desainer)

| # | Keputusan | Alasan |
|---|---|---|
| T1 | Tidak ada kolom `kind`/tabel baru; `group_name` = kind | Sudah dipakai di semua query & komponen |
| T2 | Hapus jalur `getTransferBudgets`/`goalMap`; `getSavingBudgets` jadi satu-satunya | Dua implementasi untuk angka yang sama = pasti drift |
| T3 | Server tolak `goal_id` pada earning | Validasi di trust boundary (AGENTS) |
| T4 | Ledger key di bawah `goalKeys`; mutasi transaksi invalidate `budgetKeys.all` | Hilangkan angka basi tanpa kode baru |
| T5 | Commit migration idempotent untuk `budget_period` & `savings_goals.account_id` (tanpa drop) | Repo = cermin DB; drop kolom = risiko tanpa manfaat |
| T6 | Tidak backfill `goal_id` impor | Base `collected_amount` sudah memuat angka itu → double count |
| T7 | Filter anti double-count = `isNull(transactions.goal_id)` inline di 3 query spending | 3 tempat, satu baris masing-masing; helper = abstraksi tanpa guna |
| T8 | Drill per goal di budget: pakai `getGoalLedger` + filter bulan (bukan query baru) | Reuse; kalau terasa berat, cukup link ke `/goals` |

---

## 6. Setelah eksekusi — dokumen yang harus ikut

- `AGENTS.md`: aturan tanda goal (tabel bagian 2), "saving target = `monthly_contribution`", filter `goal_id IS NULL` di expense; perbaiki `goal_type "emergency"` yang basi.
- `docs/architecture-integration.md` bagian 4: centang item yang sudah jadi (goal_id, collected derived, assets) — checklist-nya sudah basi sejak Juli.
- `README.md` + `docs/roadmap.md`: fitur goal ledger & saving per goal.
