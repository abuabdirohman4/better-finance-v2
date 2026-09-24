# bf-bwh (M2.2 Cutover) + bf-4m1 (M3.2 Import 2025)

**Date:** 2026-09-24 · **Issues:** `bf-bwh` (anak `app-s4hm.5`), `app-s4hm.8` (M3.2, plan lama `2026-08-11-bf-4m1-...`)
**Mode:** Claude interaktif (butuh dry-run + lihat data nyata). Bukan Antigravity blind.
**User:** `321d6292-f86d-4807-96fa-df1dc5e130ac` (= `MIGRATE_USER_ID` di `.env.local`)

> ⚠️ Jalankan script pakai **npm/npx**, BUKAN `pnpm`. Project ini npm (`package-lock.json`).
> `pnpm migrate` memicu pnpm meng-install ulang `node_modules` (layout pnpm) + bikin
> `pnpm-lock.yaml`/`pnpm-workspace.yaml`. Command yang benar:
> `npm run migrate -- 2026 --dry` (atau `npx tsx --env-file=.env.local scripts/migrate-sheet.ts 2026 --dry`).

---

## 0. Temuan dari data nyata (24 Sep 2026)

### DB (read-only SQL)
| Fakta | Angka |
|---|---|
| Transaksi imported / manual | 2.591 / 10 (manual = 9 seed `opening-2026-nl-*` + 1 transfer 24 Mei) |
| Tanggal transaksi imported terakhir | **2026-08-16** (run terakhir 16 Agu) → sheet sudah jalan ±5 minggu di depan DB |
| `debts` / transaksi ber-`debt_id` / ber-`goal_id` | **0 / 0 / 0** → re-run belum bisa merusak debts/goal (belum ada) |
| Transaksi bertanggal 2025 | 11 (baris 22–29 Des 2025 dari tab Jan 2026, siklus gaji) |
| Grup natural-key kembar (live) | 10 (kebanyakan sah: same-day identik, lihat ceiling di §3) |
| **Self-transfer** (`account_id = to_account_id`) | **20 baris live**: Mandiri 11× Rp3,73jt · BNI 6× Rp628rb · Jago 1× Rp500rb · BCA 1× Rp255rb |

Self-transfer lahir dari `parseInvestmentDest` Tipe B/D (dest = akun sumber) saat sumbernya akun liquid
(mis. note `Tabungan`, `Pajak Mobil - 1 Tahun`). Uang keluar dari Mandiri tapi tidak masuk ke mana pun →
bagian investasi ditambal opening `nl` negatif (lihat bawah).

**Saldo tersimpan vs Σ transaksi (`derived`)** — hanya 4 akun beda:
| Akun | `current_balance` | Σ tx | Sebab |
|---|---|---|---|
| Jago | 1.492.227 | 992.227 | self-transfer 23 Mei 500rb (drift 500rb) |
| BNI (inactive) | 628.520,64 | 0 | 6 self-transfer; tak ikut Net Worth (filter `is_active`) |
| AR | 473.900 | 5.785.316,80 | script set AR = Summary langsung, semua baris AR diimpor satu arah |
| AP | 0 | 8.425.772 | idem |

**Opening `nl` 2026 negatif** (mustahil untuk saldo nyata 1 Jan): Manulife −3,94jt, Trimegah Kas −6,96jt,
BRI Indeks −4,59jt, Sucor Equity −1,08jt, Simas −600rb, Majoris −187rb. Artinya arus per-sub-produk 2026
tidak lengkap (rebalance `Account="-"` di-skip, self-transfer). Total grup tetap benar; per sub-produk tidak.
Konsekuensi untuk 2025: kontinuitas **per sub-produk tidak akan cocok** — hanya level total/grup.

### Sheet (gviz)
- **2026 "My Financial App"** `1mVgdePl…` — Summary tab 11 akun (Wallet, Mandiri, BCA, E-Toll, Flip, GoPay, Grab,
  Jenius, Ovo, AR, AP), kolom `Value` **dan** `Balancing`. Beda di 2 akun: Wallet 223.000 vs 320.000, Mandiri
  1.017.328 vs 1.670.856. Script pakai `Value` (kolom 1). AP = **−1.584.500** (tanda natural = cocok konvensi app).
  Tab Sep ada (±226 baris, Agu+Sep).
- **"2025" `18iigYTz…` BUKAN sheet 2025.** Judulnya "My Financial 2026" (tab Aug, Sep, 📌 Summary, 📈 Budget,
  🎯 Goals, 📝 Note; tab Jan berisi transaksi Jan 2026). **ID sheet 2025 yang asli belum diketahui → blocker M3.2.**
  Tetap berguna: formatnya = format lama (AKTIVA/PASIVA) → jadi fixture uji parser (§3 Task 2).
- Format lama (dari tab Jan `18iig`): kolom 0 kosong, header terpecah 5 baris, label bucket TIDAK ada di header
  tab bulan, angka negatif pakai kurung `(740,233)`, nol = `"  - "`. Posisi kolom: 1 Date · 2 Transaction ·
  3 Account · 4 Category · 5 Note · 7 Wallet · 8 ATM · 9 Platform · 10 Investment · 11 Saving · 12 AR · 14 AP ·
  15 NP · 16 OI · 17 RE · 18 NET.
- **`parseNum("(740,233)")` = 0** → script sekarang diam-diam membuang SEMUA angka negatif format lama.
- **gviz fallback:** nama tab yang tidak ada → gviz mengembalikan **tab pertama** tanpa error. `sheet=Summary`
  di file lama (tab aslinya `📌  Summary`) = baca tab yang salah. Tab Okt–Des 2026 yang belum ada juga kena.
  Alternatif lebih setia: `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<gid>`.

### `--dry` aman untuk DB (dibaca dari kode)
Semua write di-gate `!dry`: create akun/kategori (L471), insert transaksi (L787 `continue`), goals (L912),
delete opening + recompute + AR/AP (L963, L1045, L1070). Efek samping `--dry` hanya menulis
`docs/migrate-review-<year>.csv` + `docs/migrate-skipped-<year>.csv` (gitignored `docs/migrate*`).
Dry-run 2026 **belum** dijalankan di sesi planning (izin ditolak karena menimpa CSV review lama) → langkah pertama executor.

---

## 1. Apa yang dilakukan re-run `migrate 2026` (non-dry) HARI INI

| Task | Efek | Aman? |
|---|---|---|
| T2 akun/kategori | bikin akun untuk nama baru di sheet sejak 16 Agu (nama tak dikenal = akun baru, `asset_category` ditebak) | ⚠️ cek daftar "New accounts" di dry-run |
| T3 transaksi | insert ±baris 17 Agu–24 Sep. Dedup hanya vs `is_imported=true`. Baris yang **diedit di app** setelah import (akun/nominal/note berubah) → key beda → **masuk dobel** | ✅ selama belum input harian di app |
| T4 goals | **menimpa** `target/collected base/monthly/deadline` semua goal dengan nilai sheet | ⚠️ kalau goal sudah diedit di app (mis. `monthly_contribution` untuk budget Saving) → hilang |
| T5 opening | hapus opening liquid, hitung ulang `opening = Summary − Σ semua tx` → saldo liquid dipaksa = Summary. **Menyerap** selisih apa pun (juga salah input) — rekonsiliasi paksa, bukan verifikasi | ✅ by design, tapi diff tak terlihat |
| T5 recompute | `current_balance` = Σ tx untuk semua akun → **Jago turun 500rb** (992.227), BNI → 0 | ⚠️ Jago salah |
| T5 AR/AP | set `current_balance` = Summary (AR 69.665, AP −1.584.500) | ✅ sekarang (0 debts). ❌ setelah debts dibuat → desync |
| Split sub-produk | aman: T3 resolve by nama akun sekarang (Tipe C `Emas : X` → sub-akun); akun agregat sudah di-rename | ✅ |
| `is_wallet` | tidak disentuh script | ✅ |
| AR = investment | tidak disentuh (akun sudah ada) | ✅ |

**Kesimpulan:** re-run 2026 masih aman **satu kali lagi**, dengan syarat: (a) belum ada input harian di app,
(b) belum ada `debts`, (c) patch kecil §2 Task 1 dipasang dulu. Setelah itu script 2026 dibekukan.

---

## 2. M2.2 Cutover — langkah

### Task 1 — Patch `scripts/migrate-sheet.ts` (sebelum run final)

**1a. Guard self-transfer** (di T3, setelah `toAccountId` ditentukan, sebelum dedup):
```ts
// Self-transfer = dest parser jatuh ke akun sumber; log, jangan insert.
if (finalType === "transfer" && toAccountId && toAccountId === (overrideAccountId ?? accountId)) {
  skippedRows.push({ month, date: txDate, account: accountName, note, amount, reason: "self-transfer" });
  continue;
}
```

**1b. Guard tab palsu (gviz fallback)** di loop Task 1, setelah `normalizeHeader`:
```ts
if (!header.includes("Date") || !header.includes("Transaction")) {
  console.log("skip (bukan tab transaksi — gviz fallback?)");
  continue;
}
```

**1c. Flag `--skip-goals`** (T4): `const skipGoals = args.includes("--skip-goals");` lalu
`if (!goalsCsv || skipGoals) { console.log("  Goals skip"); } else { ... }`.

**1d. Freeze setelah cutover** (atas `main`, dipakai di Task 7):
```ts
// Tahun yang sudah cutover — app jadi sumber kebenaran; re-run = dobel + opening ditimpa.
const FROZEN_YEARS = new Set<string>([]); // isi "2026" setelah run final
// di main(), setelah validasi year:
if (FROZEN_YEARS.has(year) && !args.includes("--force-frozen")) {
  console.error(`Year ${year} frozen (cutover). Jangan re-run.`); process.exit(1);
}
```
Test: tidak perlu unit test (script one-off); verifikasi lewat dry-run.

### Task 2 — Pra-cek (SQL read-only)
```sql
-- harus 0 / 0 / 0 sebelum run final
SELECT (SELECT count(*) FROM debts WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac') debts,
       (SELECT count(*) FROM transactions WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND goal_id IS NOT NULL) goal_tx,
       (SELECT count(*) FROM transactions WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac'
          AND NOT is_imported AND created_at > '2026-08-18') manual_baru;
-- goal yang sudah diedit di app (kalau ada → run pakai --skip-goals)
SELECT name, monthly_contribution, updated_at FROM savings_goals
WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND updated_at > created_at + interval '1 minute';
```

### Task 3 — Backup (user)
Supabase Dashboard → Database → Backups (point-in-time), ATAU:
```bash
pg_dump "$DATABASE_URL" -t transactions -t accounts -t savings_goals -t debts -t categories \
  --data-only -f ~/Documents/backup-bf-precutover-$(date +%F).sql
```

### Task 4 — Stop sheet di tanggal cutover D, dry-run, run final
1. User berhenti input di sheet setelah transaksi tanggal D−1 (rekomendasi D = **1 Okt 2026**).
2. Samakan `Value` = `Balancing` di Summary sheet (lihat Keputusan 2).
3. Dry-run: `npm run migrate -- 2026 --dry > /tmp/dry2026.log 2>&1`
   Cek: `New accounts to create: 0` (atau memang disengaja), `Planned` ≈ jumlah baris 17 Agu–30 Sep,
   `docs/migrate-skipped-2026.csv` baris `self-transfer` baru, tabel verify `mismatched: 0`.
4. **[PROD WRITE]** `npm run migrate -- 2026 [--skip-goals]`

### Task 5 — Rekonsiliasi (SQL read-only)
Isi `VALUES` dengan angka Summary saat D (kolom yang disepakati).
```sql
WITH summary(name, sheet) AS (VALUES
  ('Wallet',0),('Mandiri',0),('BCA',0),('E-Toll',0),('Flip',0),('GoPay',0),
  ('Grab',0),('Jenius',0),('Ovo',0),('AR',0),('AP',0)),
d AS (
  SELECT a.id, a.name, a.is_active, a.current_balance,
    COALESCE(SUM(CASE WHEN t.transaction_type='earning' THEN t.amount
                      WHEN t.transaction_type='spending' THEN -t.amount
                      WHEN t.account_id = a.id THEN -t.amount ELSE t.amount END),0) AS derived
  FROM accounts a
  LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id) AND t.deleted_at IS NULL
  WHERE a.user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac'
  GROUP BY a.id)
SELECT d.name, d.is_active, s.sheet, d.current_balance, d.derived,
       d.current_balance - s.sheet AS vs_sheet, d.current_balance - d.derived AS drift
FROM d LEFT JOIN summary s ON s.name = d.name
WHERE s.sheet IS NOT NULL OR abs(d.current_balance - d.derived) > 0.5
ORDER BY abs(COALESCE(d.current_balance - s.sheet, 0)) + abs(d.current_balance - d.derived) DESC;
```
Target: `vs_sheet = 0` untuk 11 akun Summary; `drift ≠ 0` hanya AR/AP (by design) dan BNI inactive.
Non-liquid: bandingkan total per grup dengan tab Assets sheet:
```sql
SELECT COALESCE(investment_group, name) grp, SUM(current_balance) FROM accounts
WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND is_active AND asset_category = 'investment'
GROUP BY 1 ORDER BY 1;
```
Net Worth snapshot (simpan angkanya — patokan M3.2):
```sql
SELECT SUM(current_balance) FROM accounts WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND is_active;
```

### Task 6 — Bereskan drift (sesuai Keputusan 3 & 5)
- Self-transfer lama (20 baris): **[PROD WRITE]** re-point `to_account_id` ke akun tujuan sebenarnya
  (daftar dari SQL di bawah; user tentukan tujuan per note), lalu hitung ulang saldo akun yang tersentuh
  lewat RPC `apply_transaction_balances` (delta +amount ke tujuan baru). Jago: transfer Jago→Jago 500rb
  kemungkinan cukup dihapus (soft delete) — saldo tersimpan sudah benar.
  ```sql
  SELECT t.id, t.transaction_date, a.name, t.amount, t.note FROM transactions t JOIN accounts a ON a.id = t.account_id
  WHERE t.user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND t.account_id = t.to_account_id AND t.deleted_at IS NULL
  ORDER BY a.name, t.transaction_date;
  ```
- AR/AP: setelah run final, buat debts per orang lewat UI `/debts` dengan **`opening_amount`** + "money moves now" OFF
  (tidak menyentuh saldo). Sisa = "Untracked" — boleh.

### Task 7 — Bekukan
1. `FROZEN_YEARS = new Set(["2026"])` di script (Task 1d).
2. Opening statis = otomatis: baris `2026-Opening` hanya diubah Task 5 script; script beku → opening tak berubah lagi.
3. Sheet (user): rename file "My Financial App — FROZEN <D>, pakai app", Data → Protect sheets (semua tab), atau
   ubah akses jadi view-only.
4. Docs: `AGENTS.md` bagian "Migrasi Sheet → DB" tambah: *2026 dibekukan per <D>; jangan re-run; pakai npm bukan pnpm;
   gviz fallback ke tab pertama*. `docs/roadmap.md` C2 ✅. `bd close bf-bwh`, update `app-s4hm.5`.

---

## 3. M3.2 Import 2025 — desain

**Blocker:** ID sheet 2025 asli. Minta user (cari file "My Financial 2025" di Drive). Tanpa itu stop di Task 2.

### Masalah inti: double counting opening
Sekarang `saldo = opening2026 + Σ tx 2026` (+11 baris Des 2025). Menambah tx 2025 + opening 2025 tanpa
menyentuh opening 2026 → saldo terhitung dua kali.

**Rekomendasi — Opsi B "carry adjustment":** impor 2025, lalu **kecilkan** opening 2026 sebesar tambahan yang
dibawa 2025, sehingga `current_balance` dan Net Worth **tidak berubah sama sekali**:
```
extra(akun)          = Σ tx baru bertanggal ≤ 2025-12-31 (termasuk opening 2025)
opening2026_baru     = opening2026_lama − extra
|opening2026_baru|<1 → hapus baris (kontinuitas sempurna)
selain itu           → tetap, note "Carry adjustment 2025→2026" (= selisih nyata antar sheet, terlihat & bisa diaudit)
```
Opsi A (2025 "tahun tertutup" tanpa efek saldo) ditolak: app tidak punya konsep tx non-saldo; recompute apa pun
akan menjumlahkannya.

### Task 1 — Parser format lama (`scripts/migrate-sheet.ts`)
- `parseNum`: dukung kurung + dash.
  ```ts
  function parseNum(raw: string): number {
    const s = raw.trim();
    if (!s || s === "-") return 0;
    const neg = /^\(.*\)$/.test(s);
    const n = parseFloat(s.replace(/[(),\s]/g, ""));
    return isNaN(n) ? 0 : neg ? -n : n;
  }
  ```
- Header format lama: cari baris yang memuat `Transaction` + `Account` (baris ke-5), lalu **peta posisi tetap**
  relatif ke kolom `Transaction` (idx T): Date=T−1, Account=T+1, Category=T+2, Note=T+3, Wallet=T+5, ATM=T+6,
  Platform=T+7, Investment=T+8, Saving=T+9, AR=T+10, AP=T+12, NP=T+13, OI=T+14, RE=T+15, NET=T+16.
  Bangun `header: string[]` sintetis dengan nama kanonik supaya `get(col)` sisa script tidak berubah.
  Data mulai baris setelah header. Hanya dipakai kalau header gviz tidak punya `Date`.
- Nama tab: konstanta per tahun (`SUMMARY_TAB = { "2025": "📌  Summary", "2026": "Summary" }`), atau pindah ke
  `export?format=csv&gid=` kalau gid diketahui.

### Task 2 — Uji parser pakai fixture 2026 format lama (read-only)
`SHEET_ID_2025=18iigYTz2ked8bobH1CWGY2sDC-efuNsHjBhEYzdGZqM npm run migrate -- 2025 --dry`
Karena isinya transaksi 2026 yang sudah ada, hasil yang benar: **`Planned` ≈ 0, `Skipped (dup)` ≈ semua**.
Kalau banyak "Planned" → parser/mapping beda dari format App → perbaiki dulu. (Hapus `docs/migrate-review-2025.csv` setelahnya.)

### Task 3 — Scope Task 4/5 per tahun (wajib sebelum run 2025 non-dry)
Flag `--historical` (atau otomatis `year !== LATEST_YEAR`):
- T4 goals: **skip** (goals 2025 akan menimpa goal aktif).
- T5: mutasi dibatasi `transaction_date <= '<year>-12-31'` dan exclude `source_month LIKE '%-Opening'` tahun lain;
  opening hanya untuk akun liquid di Summary 2025.
- T5 AR/AP override + recompute: **skip** (diganti Task 5 di bawah).

### Task 4 — Alias akun lama
Dry-run 2025 → baca "New accounts to create". Setiap nama lama dipetakan ke akun sekarang:
```ts
const ACCOUNT_ALIAS: Record<string, string> = {
  // "<nama di sheet 2025>" (lowercase) → "<nama akun v2 sekarang>"
  // contoh: "rdpu : trimegah": "RDPU : Trimegah Kas Syariah",
};
// dipakai di resolve: accountMap.get(ACCOUNT_ALIAS[n] ?.toLowerCase() ?? n)
```
Agregat `Emas`/`Saham` tanpa sub → alias ke sub-akun hasil rename (Keputusan 8). Target dry-run: 0 akun baru
(kecuali disengaja), 0 kategori sampah (cek `New categories`).

### Task 5 — Carry adjustment (SQL, **[PROD WRITE]**, satu transaksi)
Snapshot dulu: `CREATE TEMP TABLE`-less — simpan hasil ini sebelum import 2025:
```sql
SELECT id, name, current_balance FROM accounts WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' ORDER BY name;
```
Setelah import 2025 (T3 insert + opening 2025), per akun:
```sql
BEGIN;
WITH extra AS (
  SELECT a.id, SUM(CASE WHEN t.transaction_type='earning' THEN t.amount
                        WHEN t.transaction_type='spending' THEN -t.amount
                        WHEN t.account_id = a.id THEN -t.amount ELSE t.amount END) AS amt
  FROM accounts a JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
  WHERE a.user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND t.deleted_at IS NULL
    AND (t.source_month LIKE '2025-%')          -- hanya baris run 2025 (bukan 11 baris Des dari run 2026)
  GROUP BY a.id)
SELECT * FROM extra;  -- review dulu, lalu executor tulis UPDATE/INSERT opening 2026 per akun:
-- signed_opening_baru = signed_opening_lama − extra.amt
-- update amount + transaction_type (earning kalau ≥0, spending kalau <0), note 'Carry adjustment 2025→2026';
-- akun tanpa opening 2026 → INSERT baris baru source_month='2026-Opening', hash 'carry-2026-<slug>'.
-- current_balance TIDAK disentuh (tak berubah by construction).
COMMIT;
```
Verifikasi (harus identik dengan snapshot):
```sql
SELECT a.name, a.current_balance, SUM(CASE WHEN t.transaction_type='earning' THEN t.amount
  WHEN t.transaction_type='spending' THEN -t.amount WHEN t.account_id=a.id THEN -t.amount ELSE t.amount END) derived
FROM accounts a LEFT JOIN transactions t ON (t.account_id=a.id OR t.to_account_id=a.id) AND t.deleted_at IS NULL
WHERE a.user_id='321d6292-f86d-4807-96fa-df1dc5e130ac' GROUP BY a.id ORDER BY a.name;
-- current_balance tiap akun = snapshot; derived berubah HANYA sebesar drift yang memang sudah ada
-- (AR/AP/BNI/Jago dari Task 5 rekonsiliasi). Net Worth = snapshot Task 5 cutover.
```
Laporan kontinuitas = daftar baris "Carry adjustment" dengan |amount| besar → user cek satu per satu.

### Jawaban pertanyaan desain
- **Dedup lintas tahun:** jalan — key = tanggal|tipe|akun|akun tujuan|nominal|note, tanpa tahun/bulan; 11 baris
  Des 2025 yang sudah ada akan ter-skip kalau tab Des 2025 memuatnya. Ceiling: dua baris identik sah di hari yang
  sama digabung jadi satu (perilaku sama dengan 2026).
- **current_balance dobel?** Tidak dengan Opsi B (Task 3 mematikan recompute + AR/AP override; Task 5 menjaga saldo).
- **Akun agregat lama:** lewat `ACCOUNT_ALIAS`; per sub-produk tidak akan kontinu (opening nl 2026 negatif sudah
  membuktikan) → residual ditampung carry adjustment, total grup tetap benar.
- **Non-liquid opening 2025:** tidak di-seed (Keputusan 9) — carry adjustment menampung.

---

## Files
| File | Perubahan |
|---|---|
| `scripts/migrate-sheet.ts` | guard self-transfer, guard tab palsu, `--skip-goals`, `FROZEN_YEARS`; (M3.2) `parseNum` kurung, header format lama, tab name per tahun, `--historical` scoping, `ACCOUNT_ALIAS` |
| `AGENTS.md` | Migrasi Sheet → DB: freeze 2026, npm bukan pnpm, gviz fallback, carry adjustment |
| `docs/roadmap.md` | C2 ✅ / D2 status |
| DB (prod, via user approve) | run final 2026, fix self-transfer, debts opening via UI, run 2025, carry adjustment |
