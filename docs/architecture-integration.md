# Arsitektur Integrasi: Goals · Assets · Transactions · Budgets

> **Ini fitur pembeda Better Finance.** Bukan 4 fitur terpisah — 1 source of truth (transaksi) yang mengalir ke semua view lain. Dokumen ini menjelaskan model integrasi v1 (Google Sheets) dan cara menerjemahkannya ke v2 (Postgres/Drizzle).

---

## 1. Model v1 (Google Sheets) — cara "semua terhubung"

Sistem keuangan v1 dipakai 2020→2026 di Google Sheets (1 file = 1 tahun, format machine-readable sejak 2025). Kuncinya: **sheet transaksi bulanan adalah double-entry accounting tersembunyi.**

### Sheet transaksi (mis. tab `Jul`)

Header:
```
Date | Transaction | Account | Category | Note | Wallet | ATM | Platform | Investment | Saving | AR | AP | NP | OI | RE | NET
```

- `Transaction` = tipe: `Earning` | `Spending` | `Transfer`
- `Account` = akun sumber (Wallet, Mandiri, BNI, Bibit, Jago, ...)
- `Category` = kategori (House, Transport, Health, Salary, ...) — untuk transfer, bisa juga nama akun tujuan
- **`Wallet, ATM, Platform, Investment, Saving, AR, AP` = kolom bucket/pos.** Satu baris menaruh angka (+/-) di kolom bucket relevan.

Contoh baris (dari data asli 2026):
| Transaction | Account | Category | Wallet | Investment | Saving | RE |
|---|---|---|---|---|---|---|
| Transfer (JHT) | Mandiri | Investment | -231630 | +231630 | | |
| Earning (Salary) | Mandiri | Salary | +11581500 | | | +11581500 |

Jadi 1 transaksi = beberapa kolom bucket terisi sekaligus (double-entry).

### Semua sheet lain = agregasi kolom bucket

| Sheet | Isinya | Formula sumber |
|---|---|---|
| **Summary** | Saldo tiap akun (Wallet, Mandiri, BCA, ...) | `SUM(kolom akun)` sepanjang semua transaksi |
| **Assets** | `name, value, type` (liquid/non-liquid) | Saldo akun dari Summary, dikelompokkan per tipe |
| **Goals** | `Collected`, `Retained` per goal | `SUM` transaksi ber-`Account`+`Category` tertentu → kolom `Saving`/`Investment` |
| **Budget** | `Earning`/`Spending`/`Transfer` per kategori | `SUM` transaksi per `Category` |

**Contoh nyata:**
- Goal "Kontrakan" (`Account=Bibit, Category=House`) → `Collected=5205227` = jumlah semua transaksi 2026 Account=Bibit + Category=House yang masuk kolom Saving. Otomatis via formula.
- Asset "Reksadana" `14917053.9` = saldo akun Reksadana.

### Kelemahan match implisit (Account+Category)

v1 me-link transaksi→goal lewat kecocokan `Account`+`Category`, TANPA ID eksplisit. Ini rapuh:
- 2 goal "Pajak Motor" (1 Tahun & 5 Tahun) sama-sama `Account=BNI, Category=Transport` → formula **tidak bisa bedakan**. Di sheet, dipisah manual (workaround).

---

## 2. Model v2 (Postgres/Drizzle) — terjemahan

### Fondasi yang sudah benar

- `transactions` + `accounts.current_balance` (via RPC `apply_transaction_balances`) = pengganti kolom bucket. **Saldo akun sudah live dari transaksi.** ✓
- Ini setara kolom bucket v1 — cukup untuk Summary & Assets.

### Yang hilang (bikin goals/assets/budget "tidak terhubung" saat ini)

1. **Transaksi belum punya link ke goal.** v2 `transactions` tidak punya `goal_id`.
2. **`goals.collected_amount` masih manual input**, belum di-derive.
3. **Assets belum ada / belum di-derive** dari `accounts.current_balance`.

### Keputusan desain: `goal_id` eksplisit (BUKAN match implisit)

**Di aplikasi, tag eksplisit lebih baik daripada match Account+Category:**

| Aspek | Match implisit (v1) | `goal_id` eksplisit (v2) |
|---|---|---|
| Tambah "kolom" | Ribet di sheet (geser range, update formula) | 1 migration di DB — mudah, direkomendasikan |
| 2 goal sama Account+Category | Ambigu, tak bisa dibedakan | Bersih, tiap transaksi tag goal spesifik |
| Integritas | Tidak ada | FK ke savings_goals |
| Agregasi | Formula range | `SUM WHERE goal_id = X` |

Maka:
```sql
ALTER TABLE transactions ADD COLUMN goal_id UUID REFERENCES savings_goals(id);
```
```
collected_amount = SUM(transactions.amount WHERE goal_id = goal.id AND type kontribusi)
```

Assets:
```
asset.value = account.current_balance (dikelompok per asset_category: liquid / non-liquid)
net_worth   = SUM(liquid) + SUM(non-liquid)
```

### Rantai integrasi v2 (transitif)

```
transactions ──(RPC)──> accounts.current_balance ──┬──> Assets (agregat per category)
      │                                             └──> Net Worth
      └──(goal_id)──> Goals.collected_amount (SUM per goal)
      └──(category)──> Budgets (SUM per category per bulan)  [sudah ada di v2]
```

Satu source of truth (`transactions`) → semua view derived. Persis prinsip v1, tapi dengan integritas & presisi DB.

---

## 3. UI/UX — jaga tetap simpel

Kekhawatiran: `goal_id` jangan bikin user tag manual tiap transaksi. Solusi — tag **opsional & kontekstual**, app nebak default:

| Pola | Cara kerja | Kapan |
|---|---|---|
| **Auto-suggest** | Saat input, kalau Account+Category cocok goal aktif → app pra-isi goal (logika v1 sebagai default cerdas). User tinggal konfirmasi. | Mayoritas transaksi |
| **Field opsional** | Bottom sheet transaksi: dropdown "Untuk Goal (opsional)", muncul hanya saat relevan (type Transfer/Saving). Kosong = OK. | Transaksi umum |
| **Tag dari halaman Goal** | Buka goal → "Tambah kontribusi" → langsung buat transaksi ter-tag. Alur terbalik, natural. | Nabung ke goal spesifik |

Hasil: user hampir tak pernah tag manual — app nebak dari Account+Category (kebiasaan v1), user cuma koreksi saat perlu. `goal_id` terisi di belakang layar. **Simpel di depan, rapi di belakang.**

---

## 4. Status implementasi

- [x] `transactions` → `accounts.current_balance` via RPC (fondasi bucket)
- [x] Budgets per category per bulan (sudah derived dari transactions)
- [x] `transactions.goal_id` kolom + FK (migration `20260723_goal_id_and_goal_type.sql`)
- [x] `goals.collected_amount` derived — base + Σ transfer − Σ spending ber-goal_id (bf-4ln, bf-btz)
- [x] Assets = agregat `accounts.current_balance` per asset_category + net worth (`/net-worth`, `getAssets`)
- [ ] UI auto-suggest goal saat input transaksi
- [ ] UI "Tambah kontribusi" dari halaman goal

> Saat ini goals & assets pakai input manual sementara (keputusan sadar) — reimplement jadi derived setelah arsitektur ini disepakati.
