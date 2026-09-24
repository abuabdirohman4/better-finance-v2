# bf-noo (M3.1) — Import Budget Historis dari Sheet

**Date:** 2026-09-24
**Issue:** bf-noo / M3.1
**Status:** Plan (menggantikan `2026-08-11-bf-noo-import-budget-historis.md`, yang ditulis sebelum bf-yz4)
**Migration:** tidak ada (isi tabel `budgets` yang sudah ada)
**Mode:** B (direct/Sonnet) — 1 file script + 1 baris AGENTS.md, ~90 baris

---

## Temuan (dicek 2026-09-24, sheet asli + DB prod)

1. **Sumber terbaik = tab `📈  Budget` di sheet `18iigYTz2ked8bobH1CWGY2sDC-efuNsHjBhEYzdGZqM` (gid `1236804720`).**
   Walau ID ini disebut "sheet 2025", isi tab Budget-nya adalah angka **2026 Jan–Sep** (label "2026" di header;
   actual JAN/MAR/APR Dining Out cocok persis dengan transaksi 2026 di DB). Kolom DEC/NOV/OCT kosong (`-`).
   Sheet 2026 (`1mVg…`) tab `Settings` bahkan menunjuk ke sheet ini. → **Tidak ada data budget 2025.**
2. Tab `Spending`/`Earning` di sheet 2026 hanya punya Feb–Sep (Jan hilang) — tidak dipakai.
3. **Pakai endpoint `export?format=csv&gid=…`, BUKAN gviz.** gviz menebak baris header secara acak untuk tab ini
   (kadang label `BUDGET SEP` hilang, baris `TOTAL NET EARNING` terbuang). Export = nilai tampil persis.
   Format angka akuntansi: `(1,000,000)` = negatif, ` - ` = 0.
4. Layout: kolom B = nama, kolom `BUDGET <MON>` per bulan. Section header di kolom B: `EARNING`, `SPENDING`,
   `TRANSFER`, `SUMMARY`. Baris `EATING : 25%` (grup, ada `:`), `TOTAL …`, dan baris kosong = bukan kategori.
   Kolom C `BUDGET` (tanpa bulan) = template default → diabaikan.
5. **Transfer (Sinking/Emergency/Investment) & SpendingTF di-skip** — setelah bf-yz4 target saving/investing
   diturunkan dari `savings_goals.monthly_contribution`; baris `budgets` grup saving/investing diabaikan app.
6. User = Abu `321d6292-f86d-4807-96fa-df1dc5e130ac` (`MIGRATE_USER_ID`). Budgets yang sudah ada (7 baris, dibuat
   2026-08-11 dari app, kemungkinan uji coba):

   | Bulan | Kategori (grup) | DB | Sheet |
   |---|---|---|---|
   | Jul | Food (eating) | 700.000 | 700.000 (sama) |
   | Jul | Salary (earning) | 12.000.000 | 11.697.315 |
   | Aug | Salary (earning) | 10.000.000 | 11.697.315 |
   | Aug | Food (eating) | 500.000 | 700.000 |
   | Aug | Other Earn (earning) | 500.000 | 0 |
   | Aug | Emergency (investing), Sinking (saving) | — | diabaikan app (bf-yz4) |

7. Pencocokan kategori (nama, case-insensitive, `is_active=true`, **dibatasi per section**):
   - SPENDING → grup ∉ earning/saving/investing: 23 kategori cocok.
   - EARNING → grup = earning: Salary, Other Earn.
   - **Tidak cocok** (di-skip + dilaporkan): `ALLOWANCE` (kategori Abu ada di grup **giving**, padahal cuma dipakai
     8 transaksi earning), `BUSINESS` earning (kategori `Business` grup living dipakai earning 15x + spending 5x),
     `GRAB CREDIT` (kategori nonaktif — itu nama akun, blacklist migrate), `ORANG TUA`/`SAUDARA`/`LAIN-LAIN`
     (sub-baris Shodaqoh; Shodaqoh sudah = jumlahnya), `INVESTMENT` earning.
   - Nama saja tidak cukup: `BUSINESS` muncul di Earning DAN Spending → itu sebabnya map dipisah per section.
8. Simulasi (ambang ≥ 10.000): **205 baris** siap (Earning 10, Spending 195). Per bulan spending ≈ total sheet
   dikurangi Grab Credit 1 jt.

---

## Keputusan (rekomendasi)

1. **Tahun: 2026 saja** — tab "2025" isinya angka 2026; 2025 tidak punya budget.
2. **Tab: Budget (section Earning + Spending)**; Transfer/SpendingTF skip (bf-yz4).
3. **Konflik: skip-existing + laporkan** (`onConflictDoNothing`), tidak menimpa diam-diam.
4. **3 baris uji coba yang beda (Jul Salary, Aug Salary, Aug Food) dihapus dulu** agar sejarah ikut sheet (SQL S1, butuh konfirmasi).
5. **Allowance pindah grup giving → earning** (SQL S2, butuh konfirmasi) — hanya dipakai transaksi earning; tanpa ini budget + actual income-nya tak pernah nyambung.
6. **Business (earning) di-skip** — kategori campur income/expense; pecah kategori = issue terpisah kalau perlu.
7. **Grab Credit di-skip** — akun, bukan kategori.
8. **Flag `--budgets` di `migrate-sheet.ts`**, bukan script baru — `parseCSV`/`MONTHS`/db sudah ada di file itu; copy helper ke file baru = duplikasi.
9. **Ambang 10.000** — buang noise sheet (Other Earn 10 / 1.100 / 1.000,18).

---

## Task 1 — `scripts/migrate-sheet.ts`: tambah import budget

### 1a. Import `budgets` (baris 22)

```ts
import { accounts, accountTypes, budgets, categories, savingsGoals, transactions } from "@/db/schema";
```

### 1b. Tambah blok ini tepat SEBELUM `async function main() {`

```ts
// ── Budget import (bf-noo) ────────────────────────────────────────────────────
// Tab "📈  Budget": 1 row per category, cols "BUDGET <MON>". Only EARNING + SPENDING sections;
// TRANSFER (saving/investing) targets are derived from goals (bf-yz4) → skipped.
const BUDGET_SHEET = { id: "18iigYTz2ked8bobH1CWGY2sDC-efuNsHjBhEYzdGZqM", gid: "1236804720", year: 2026 };
// ponytail: fixed threshold drops sheet noise (Other Earn 10 / 1,100); lower it if real budgets go below.
const MIN_BUDGET = 10_000;

// Accounting format from the export: "(1,000,000)" → -1000000, "-" → 0.
function parseAcct(raw: string): number {
  const s = raw.trim().replace(/,/g, "");
  if (!s || s === "-") return 0;
  const n = parseFloat(s.replace(/[()]/g, ""));
  if (isNaN(n)) return 0;
  return s.startsWith("(") ? -n : n;
}

async function importBudgets(userId: string, dry: boolean) {
  // export (not gviz): gviz guesses header rows for this tab and drops the "BUDGET <MON>" labels.
  const url = `https://docs.google.com/spreadsheets/d/${BUDGET_SHEET.id}/export?format=csv&gid=${BUDGET_SHEET.gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch budget tab failed: HTTP ${res.status}`);
  const [header, ...rows] = parseCSV(await res.text());

  const monthCols = header.flatMap((h, col) => {
    const m = h.match(/^BUDGET\s+([A-Z]{3})$/i);
    const idx = m ? MONTHS.findIndex((mo) => mo.toLowerCase() === m[1].toLowerCase()) : -1;
    return idx >= 0 ? [{ month: idx + 1, col }] : [];
  });
  if (monthCols.length === 0) throw new Error("No 'BUDGET <MON>' columns found — sheet layout changed?");

  const cats = await db
    .select({ id: categories.id, name: categories.name, group_name: categories.group_name })
    .from(categories)
    .where(and(eq(categories.user_id, userId), eq(categories.is_active, true)));
  // Same name can live in both sections (BUSINESS) → match within the section's groups only.
  const earnMap = new Map(cats.filter((c) => c.group_name === "earning").map((c) => [c.name.toLowerCase().trim(), c.id]));
  const spendMap = new Map(
    cats
      .filter((c) => !["earning", "saving", "investing"].includes(c.group_name))
      .map((c) => [c.name.toLowerCase().trim(), c.id])
  );

  const existing = await db
    .select({ month: budgets.budget_month, category_id: budgets.category_id, amount: budgets.budgeted_amount })
    .from(budgets)
    .where(and(eq(budgets.user_id, userId), eq(budgets.budget_year, BUDGET_SHEET.year)));
  const existingMap = new Map(existing.map((b) => [`${b.month}|${b.category_id}`, Number(b.amount)]));

  const plan: { month: number; category_id: string; name: string; amount: number }[] = [];
  const unmatched = new Map<string, number>();
  const conflicts: string[] = [];
  let section = "";

  for (const r of rows) {
    const name = (r[1] ?? "").trim();
    if (["EARNING", "SPENDING", "TRANSFER", "SUMMARY"].includes(name)) {
      section = name;
      continue;
    }
    if (section !== "EARNING" && section !== "SPENDING") continue;
    if (!name || name.includes(":") || name.toUpperCase().startsWith("TOTAL")) continue;

    const catId = (section === "EARNING" ? earnMap : spendMap).get(name.toLowerCase());
    for (const { month, col } of monthCols) {
      const amount = Math.abs(parseAcct(r[col] ?? ""));
      if (amount < MIN_BUDGET) continue;
      if (!catId) {
        const k = `${section} ${name}`;
        unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
        continue;
      }
      const prev = existingMap.get(`${month}|${catId}`);
      if (prev !== undefined) {
        if (Math.abs(prev - amount) > 0.01) conflicts.push(`${MONTHS[month - 1]} ${name}: db=${prev} sheet=${amount}`);
        continue;
      }
      plan.push({ month, category_id: catId, name, amount });
    }
  }

  console.log(`\n💰 Budget import year=${BUDGET_SHEET.year} dry=${dry}`);
  for (let m = 1; m <= 12; m++) {
    const rowsM = plan.filter((p) => p.month === m);
    if (rowsM.length) console.log(`  ${MONTHS[m - 1]}: ${rowsM.length} rows, Σ ${rowsM.reduce((s, p) => s + p.amount, 0)}`);
  }
  console.log(`  Total to insert: ${plan.length}`);
  for (const [k, n] of unmatched) console.log(`  ⚠️  no category: ${k} (${n} months)`);
  for (const c of conflicts) console.log(`  ⚠️  kept existing: ${c}`);

  if (dry || plan.length === 0) return;
  await db
    .insert(budgets)
    .values(
      plan.map((p) => ({
        user_id: userId,
        budget_year: BUDGET_SHEET.year,
        budget_month: p.month,
        category_id: p.category_id,
        budgeted_amount: p.amount.toFixed(2),
      }))
    )
    .onConflictDoNothing();
  console.log(`  ✅ Inserted ${plan.length} budget rows`);
}
```

### 1c. Dispatch di `main()` — setelah blok cek `MIGRATE_USER_ID` (sebelum `let sheetId = SHEET_IDS[year];`)

```ts
  if (args.includes("--budgets")) {
    if (Number(year) !== BUDGET_SHEET.year) {
      console.error(`--budgets only supports ${BUDGET_SHEET.year} (sheet has no other year)`);
      process.exit(1);
    }
    await importBudgets(userId, dry);
    return;
  }
```

Juga update docblock usage di atas file:

```
 *   pnpm tsx scripts/migrate-sheet.ts 2026 --budgets [--dry]   (bf-noo: budget targets only)
```

## Task 2 — AGENTS.md (section "Migrasi Sheet → DB"), tambah 1 bullet

```md
- **Budget (`pnpm migrate 2026 --budgets [--dry]`, bf-noo)**: tab `📈  Budget` sheet `18ii…` (gid 1236804720) via `export?format=csv` (bukan gviz — gviz salah baca header tab ini). Hanya section Earning + Spending; Transfer skip (bf-yz4). Match kategori per section (earning vs non-saving/investing). Skip-existing (`onConflictDoNothing`), konflik dilaporkan. Ambang ≥ 10.000.
```

---

## Langkah eksekusi & DB prod (user yang jalankan)

```bash
pnpm migrate 2026 --budgets --dry      # cek: ~205 rows (+9 kalau S2 dijalankan), 3 konflik kalau S1 belum
```

**S1 (konfirmasi user) — hapus 3 baris uji coba yang beda dengan sheet:**
```sql
DELETE FROM budgets b USING categories c
WHERE b.category_id = c.id AND b.user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND b.budget_year = 2026
  AND ((b.budget_month IN (7, 8) AND c.name = 'Salary' AND c.group_name = 'earning')
    OR (b.budget_month = 8 AND c.name = 'Food' AND c.group_name = 'eating'));
-- expect: DELETE 3
```

**S2 (konfirmasi user) — Allowance jadi kategori income:**
```sql
UPDATE categories SET group_name = 'earning'
WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND name = 'Allowance' AND group_name = 'giving';
-- expect: UPDATE 1 (unique (user_id, slug, group_name) aman: belum ada Allowance di earning)
```

Lalu:
```bash
pnpm migrate 2026 --budgets --dry      # expect 0 konflik, ~214 rows
pnpm migrate 2026 --budgets            # tulis
pnpm migrate 2026 --budgets --dry      # idempotent: "Total to insert: 0"
```

## Verifikasi SQL

```sql
-- per bulan: expense vs income (Jan–Sep terisi, Oct–Dec kosong)
SELECT b.budget_month,
       SUM(b.budgeted_amount) FILTER (WHERE c.group_name = 'earning') AS income,
       SUM(b.budgeted_amount) FILTER (WHERE c.group_name NOT IN ('earning','saving','investing')) AS expense,
       COUNT(*)
FROM budgets b JOIN categories c ON c.id = b.category_id
WHERE b.user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND b.budget_year = 2026
GROUP BY 1 ORDER BY 1;
-- expense Sep ≈ 9.446.212 (sheet TOTAL SPENDING 10.446.212 − Grab Credit 1.000.000)

-- tidak ada dobel
SELECT budget_month, category_id, COUNT(*) FROM budgets
WHERE user_id = '321d6292-f86d-4807-96fa-df1dc5e130ac' AND budget_year = 2026
GROUP BY 1, 2 HAVING COUNT(*) > 1;   -- expect 0 rows
```

UI: `/budgets` bulan Jan dan Aug 2026 — kartu expense + income terisi, Saving/Investing tetap dari goals.

## Files

| File | Perubahan |
|---|---|
| `scripts/migrate-sheet.ts` | import `budgets`, `BUDGET_SHEET`, `parseAcct`, `importBudgets`, dispatch `--budgets` |
| `AGENTS.md` | 1 bullet di "Migrasi Sheet → DB" |

Skipped: unit test untuk `parseAcct` (script tak dicakup vitest; dry-run + SQL verifikasi = cek-nya). Tambah kalau parser dipakai ulang di `src/`.
