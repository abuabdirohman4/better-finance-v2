# bf-gv5 — CFP financial check-up (design)

Status: design, belum dieksekusi. Budget ~4 jam. HFG Q4 M3.3.

## 1. Keputusan inti

**MVP = Opsi A: halaman `/insights` deterministik (scorecard + saran berbasis aturan), tanpa LLM.**
Plus satu tombol murah dari Opsi C: **"Copy summary"** (teks angka ringkas ke clipboard, untuk ditempel ke chat Claude kalau mau kritik naratif).

| Opsi | Biaya | Privasi | Effort | Vonis |
|---|---|---|---|---|
| A. Rules `/insights` | 0 | data tak keluar server | ~3 jam | **MVP** |
| B. LLM naratif → `ai_insights` | API per user/bulan + key + prompt tuning | data keuangan dikirim ke pihak ketiga, butuh consent | 1-2 hari (prompt, storage, expiry, error) | Tunda — setelah A terbukti dipakai, dan setelah bf-8ph (user publik) |
| C. Export snapshot → chat | 0 | user yang memilih kirim | ~30 menit kalau A sudah ada | **Ikut MVP sebagai tombol** (pakai objek metrik yang sama) |

Alasan: angka-angkanya sendiri produk utamanya; narasi LLM cuma membungkus 6 angka yang bisa dihitung pasti. A bisa di-unit-test (pola `goalReality.ts`), C memberi jalan ke kritik gaya chat tanpa biaya API.

- **Hitung saat dibaca, tidak disimpan.** `ai_insights` (0 baris) TIDAK disentuh. **Tidak ada migrasi.**
- Otomatis vs on-demand: halaman dibuka = dihitung (murah, 3 query). Tidak ada cron/notifikasi.

## 2. Temuan data (DB 2026-09-24)

- 2 user; data nyata = Abu. Transaksi Des 2025 – **16 Agu 2026** (data basi ~5 minggu → halaman wajib tampilkan "based on <bulan>–<bulan>").
- `ai_insights` 0 baris, `account_balance_snapshots` 0 baris.
- **Transaksi ber-`goal_id` = 0.** Progress goal sepenuhnya dari kolom base statis. Setoran dana darurat dicatat sebagai *spending* kategori `Emergency` (grup saving, ±Rp2,05 jt/bln), bukan transfer ber-goal.
- Rata-rata Apr–Jul (bulan lengkap): income **Rp14,5 jt**, konsumsi (spending grup ∉ saving/investing) **Rp12,4 jt** → saving rate **~14%**. Kalau pakai arus kas kasar (earning − semua spending) = **−4%**. Kategori `Sinking` (Rp2,55 jt/bln) ada di grup *living*; kalau dianggap tabungan, saving rate ~32%. → Definisi kategori menentukan hasil; ditulis jelas di UI.
- Net worth (akun aktif, `include_in_net_worth`) ≈ **Rp50,8 jt**: liquid Rp4,06 jt (8%), non-liquid Rp46,7 jt. `Uang Cash` Rp2,16 jt dikecualikan dari NW.
- Liabilitas 0; AR Rp0,47 jt.
- Liquid / konsumsi = **~0,3 bulan** (target 3–6). Termasuk RDPU (Rp9,7 jt) jadi ~1,1 bulan — tapi RDPU cuma bisa dikenali dari nama (lihat Deferred).
- Goal `Dana Darurat` target Rp65,4 jt ≈ 5,3× konsumsi bulanan — ukuran target sudah sesuai aturan 6 bulan; terkumpul (base) Rp1,3 jt + Emergency Jago Rp1,5 jt.
- Top konsumsi Mar–Jul: Sinking 2,55 jt · Dining Out 1,14 · Transport 1,13 · Infaq 1,09 · House 1,07 · Grab Credit 1,0 jt/bln.

## 3. Window waktu

`endMonth` = bulan transaksi terakhir; kalau tanggal terakhir bukan akhir bulan → mundur satu bulan (bulan parsial tak dipakai). Window = 3 bulan kalender s/d `endMonth` (data sekarang: Mei–Jul 2026). Trend NW = 6 bulan s/d `endMonth`.

## 4. Metrik (rumus + sumber)

Semua transaksi: `deleted_at IS NULL`, `user_id = userId`. Opening (`source_month LIKE '%-Opening'`) dikecualikan dari flow bulanan.

| # | Metrik | Rumus | Sumber | Ambang (good / warn / bad) |
|---|---|---|---|---|
| M1 | Income bulanan | Σ `earning` di window / nBulan | query baru `getMonthlyFlows` | info |
| M2 | Konsumsi bulanan | Σ `spending` dengan `categories.group_name ∉ {saving, investing}` AND `goal_id IS NULL`, / nBulan (selaras aturan budget bf-btz) | `getMonthlyFlows` | info |
| M3 | Saving rate | `(M1 − M2) / M1` ; null kalau M1 = 0 | pure | ≥20% / 10–20% / <10% |
| M4 | Cash cushion (bulan) | `totalLiquid / M2` | `getAssets().totalLiquid` | ≥3 / 1–3 / <1 |
| M5 | Liquidity share | `totalLiquid / (totalLiquid + totalNonLiquid)` | `getAssets` | ≥15% / 5–15% / <5% |
| M6 | Debt-to-asset | `totalLiabilities / (totalLiquid + totalNonLiquid)` ; 0 → tampil "No debt" | `getAssets` | ≤30% / 30–50% / >50% |
| M7 | Trend NW | `NW(endOf m)` mundur dari `netWorth` sekarang: `NW(m−1) = NW(m) − Δ(m)`; `Δ(m)` = Σ efek saldo transaksi bulan m ke akun `include_in_net_worth` (earning `+`, spending `−` di `account_id`; transfer `−` di `account_id` & `+` di `to_account_id`, masing-masing hanya kalau akun itu masuk NW). Opening IKUT dihitung di Δ (dia memang mengubah saldo). Juga Δ bulan-bulan setelah `endMonth` s/d hari ini dikurangkan dulu. | `getMonthlyFlows` (kolom `nw_delta` per bulan) | 3 bln terakhir naik = good, turun = warn |
| M8 | Goal progress | Σ `collected_amount` / Σ `target_amount` goal aktif; + `taggedInWindow` = jumlah transaksi ber-`goal_id` di window | `getGoals` (sudah derived) + count di `getMonthlyFlows` | info; `taggedInWindow = 0` → saran S5 |
| M9 | Pola belanja | top 5 kategori konsumsi di window (avg/bln + % dari M2) | query `getCategorySpend` | kategori >30% dari M2 → saran S6 |

Catatan M7: tidak perlu `account_balance_snapshots` — Δ dari transaksi cukup karena semua mutasi saldo lewat transaksi (kecuali `migrate` overwrite AR/AP & reality check; ceiling diterima, beri komentar `ponytail:`).

## 5. Saran berbasis aturan

Fungsi murni `buildInsights(input) → { metrics, suggestions }` di `src/lib/insights.ts`. Tiap saran = `{ id, severity, key, params }`; teks lewat `t("insights.suggestions.<key>", params)`.

| id | Kondisi | Isi (en) |
|---|---|---|
| S1 | M3 < 20% | "Saving rate is {rate}%. Aim for 20%: that's {gap}/month less spending or more income." (`gap = 0.2·M1 − (M1 − M2)`) |
| S2 | M4 < 3 | "Cash covers {months} months of spending. Build it to 3 months ({target})." |
| S3 | M5 < 15% | "Only {pct}% of your net worth is liquid. Keep more in cash before adding investments." |
| S4 | M6 > 30% | "Debt is {pct}% of assets. Pay down before new investments." |
| S5 | goal aktif ada & `taggedInWindow = 0` | "No transfers were tagged to a goal in {window}. Tag saving transfers so goal progress stays real." |
| S6 | top kategori > 30% M2 | "{category} takes {pct}% of your spending." |
| S7 | trend 3 bln turun | "Net worth fell {amount} over the last 3 months." |
| S8 | data basi (hari ini − tx terakhir > 14 hari) | "Last transaction was {date}. Numbers may be outdated." |

Maks tampil semua (≤8), urut bad → warn. Tak ada status "good" → satu baris "Looking healthy".

## 6. UI sketch (`/insights`, Page Pattern: header gradient + wave)

```
[<] Financial check-up          based on May–Jul 2026
┌ Net worth  Rp50,8 jt   ▁▃▅▆▄▅ (6 bars CSS, bukan chart lib)  ┐
├ Scorecard (grid 2 kolom, chip warna good/warn/bad) ──────────┤
│ Saving rate 14% ⚠   Cash cushion 0.3 mo ✖                    │
│ Liquidity 8% ⚠      Debt: none ✓                              │
│ Goals 21% funded    Income / Spend 14,5 / 12,4 jt             │
├ Suggestions (list, ikon severity) ───────────────────────────┤
├ Top spending (5 baris: nama · avg/bln · % bar)               ┤
└ [Copy summary]  → navigator.clipboard.writeText(teks)        ┘
```
- `hideBalances` dihormati untuk semua angka rupiah (persen tetap tampil).
- Entry point: kartu link di dashboard `src/app/(app)/page.tsx` (BottomNav penuh 5 item).
- "Copy summary" = teks plain dari objek metrik yang sama, tanpa nama akun (privasi), label via `t()`.

## 7. File

| File | Isi |
|---|---|
| `src/lib/insights.ts` | pure: `pickWindow`, `buildNetWorthTrend`, `buildInsights`, `buildSummaryText` |
| `src/lib/__tests__/insights.test.ts` | ambang, window parsial, trend mundur, M1=0, no debt |
| `src/db/queries/insights.ts` | `getMonthlyFlows(userId)` (1 SQL, GROUP BY bulan: earning, consumption, nw_delta, goal_tagged, max date) + `getCategorySpend(userId, from, to)` |
| `src/app/(app)/insights/actions.ts` | `getInsightsAction` → `requireUser`, gabung `getAssets` + `getGoals` + 2 query, `ServerActionResult` |
| `src/app/(app)/insights/_hooks/useInsights.ts` | TanStack hook |
| `src/app/(app)/insights/page.tsx` | UI |
| `src/lib/query.ts` | key `insights` |
| `src/i18n/messages/en.json` + `id.json` | namespace `insights` (key identik) |
| `src/app/(app)/page.tsx` | kartu link |
| `AGENTS.md`, `docs/roadmap.md`, `README.md` | dok |

~10 file, **tanpa migrasi**.

## 8. Ditunda

- Opsi B (LLM + `ai_insights`) — setelah A dipakai & ada user publik; perlu consent + key.
- Flag `is_cash_equivalent` di akun (RDPU/Jago masuk cash cushion) — butuh migrasi; sekarang cushion konservatif (liquid saja). Jangan derive dari prefix nama "RDPU".
- Klasifikasi `Sinking` sebagai tabungan — keputusan kategori user (pindah grup di `/budgets/categories`), bukan logika insight.
- Rasio cicilan/DTI (butuh data cicilan), rasio investasi vs usia, proyeksi pensiun, alert tren per kategori, notifikasi.
- Snapshot NW historis (`account_balance_snapshots`) — trend dari Δ transaksi sudah cukup.
