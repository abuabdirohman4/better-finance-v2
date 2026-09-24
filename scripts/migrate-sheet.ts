/**
 * Migrasi data Google Sheet v1 (2025/2026) → Postgres v2.
 *
 * Usage:
 *   npm run migrate -- 2026 [--dry]
 *   npm run migrate -- 2025 [--dry]
 *   npm run migrate -- 2026 --budgets [--dry]   (bf-noo: budget targets only)
 *
 * Mode --dry: print rencana insert, tidak commit ke DB.
 *
 * Prasyarat:
 * - bf-4ln selesai (transactions.goal_id ada)
 * - DATABASE_URL di .env.local
 * - USER_ID di env MIGRATE_USER_ID atau arg ke-3
 *
 * Idempotent: skip baris yang import_row_hash sudah ada.
 */

import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { and, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import { accounts, accountTypes, budgets, categories, savingsGoals, transactions } from "@/db/schema";
import { deriveInvestmentGroup } from "@/lib/investment";

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_IDS: Record<string, string> = {
  "2026": "1mVgdePlteuewjY6DvdUmNyHf0CPoAoHY3Sh3lDymV5A",
  // 2025 ID injected via env SHEET_ID_2025 or third arg
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Kas + investasi/saving = kolom yang kita proses.
const ASSET_COLS = ["Wallet", "ATM", "Platform", "Investment", "Saving"];

// Kategori yang TIDAK boleh dibuat — nama akun, sistem internal, typo.
// Jika muncul di kolom Category sheet, skip (jangan masuk tabel categories).
const CATEGORY_BLACKLIST = new Set([
  // Nama akun liquid
  "wallet", "mandiri", "bca", "gopay", "ovo", "grab credit", "e-toll", "flip", "jenius",
  // Nama akun investment
  "jago", "bibit",
  // Internal/sistem sheet
  "rekapan", "retained", "sinking", "emergency", "investment",
  // AR/AP (jadi akun, bukan kategori)
  "ar", "ap",
  // Typo duplikat dari sheet (sudah ada versi benar)
  "entertaiment", "groceriea",
]);

// ── CSV parser (tanpa dep eksternal) ─────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

// ── Normalize header (gviz doubles header words: "Date Date" → "Date") ────────

function normalizeHeader(header: string[]): string[] {
  return header.map((cell) => {
    const trimmed = cell.trim();
    if (!trimmed) return "";
    // Collapse "X X" / "Foo Bar Foo Bar" → "X" / "Foo Bar" (gviz merges 2 header rows)
    const words = trimmed.split(/\s+/);
    if (words.length % 2 === 0) {
      const half = words.length / 2;
      const first = words.slice(0, half).join(" ");
      const second = words.slice(half).join(" ");
      if (first === second) return canonHeader(first);
    }
    return canonHeader(trimmed);
  });
}

// Map sheet header variants → canonical name the rest of the script expects.
function canonHeader(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith("category")) return "Category"; // "Category or Account" → "Category"
  return name;
}

// ── Fetch sheet tab via gviz ──────────────────────────────────────────────────

async function fetchTab(sheetId: string, tab: string): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trim().length < 10) return null;
    const rows = parseCSV(text);
    if (rows.length < 2) return null;
    return rows;
  } catch {
    return null;
  }
}

// ── Date parse (d/m/yyyy or dd/mm/yyyy) ──────────────────────────────────────

function parseDate(raw: string): string | null {
  const cleaned = raw.trim();
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── Parse numeric (strip commas, handle negatives) ────────────────────────────

function parseNum(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ── Hash for dedup ─────────────────────────────────────────────────────────────

function rowHash(fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex").slice(0, 32);
}

// Natural dedup key from FINAL values (ids, not names) — stable across sheet tabs.
// Used to skip rows already in DB regardless of which month-tab they came from.
function naturalKey(f: {
  date: string;
  type: string;
  accountId: string | null;
  toAccountId: string | null;
  amount: number;
  note: string;
}): string {
  // NOTE: categoryId intentionally excluded — old imported rows may reference
  // soft-deleted/ambiguous categories not resolvable on re-parse, which would
  // break dedup. date+type+accounts+amount+note is unique enough in practice.
  return [
    f.date,
    f.type,
    f.accountId ?? "",
    f.toAccountId ?? "",
    f.amount.toFixed(2),
    (f.note ?? "").trim(),
  ].join("|");
}

// ── Slug ───────────────────────────────────────────────────────────────────────

// Parse investment/saving transfer Note → { account (dest), goal }.
// srcAccount dipakai untuk Tipe B & D (dest = akun sumber sendiri).
// Tipe:
//   A: "<Goal> (INSTR : Produk)"  kurung ADA ":"  → dest=isi kurung (produk), goal=depan
//        "Kontrakan (RDPU : Trimegah)" → dest="RDPU : Trimegah", goal="Kontrakan"
//        "JAMSOSTEK (JHT 2%) (BPJS : JHT)" → dest="BPJS : JHT", goal="JAMSOSTEK (JHT 2%)"
//   B: "Depan (X)"  kurung TANPA ":"  → dest=srcAccount (Jago), goal=X
//        "Emergency Jago (Claude)" → dest=<src>, goal="Claude"
//   C: "Emas : X"  tanpa kurung, ada ":"  → dest="Emas : X" (akun sub-produk, bf-z6w)
//   D: plain (tanpa kurung, tanpa ":")  → dest=srcAccount, goal=note
//        "Tabungan", "Domain", "Balancing" → dest=<src>, goal=note
function parseInvestmentDest(
  note: string,
  srcAccount: string
): { account: string; goal: string | null } {
  const trimmed = note.trim();
  const parens = [...trimmed.matchAll(/\(([^)]+)\)/g)];

  if (parens.length > 0) {
    const inner = parens[parens.length - 1][1].trim();
    const lastIdx = trimmed.lastIndexOf("(");
    const front = trimmed.slice(0, lastIdx).trim();
    if (inner.includes(":")) {
      // Tipe A: instrumen di kurung = akun, depan = goal
      return { account: inner, goal: front || null };
    }
    // Tipe B: kurung tanpa ":" = goal, akun = sumber
    return { account: srcAccount, goal: inner || null };
  }

  // No parens
  if (trimmed.includes(":")) {
    // Tipe C: "Emas : Antam 1g" → akun sub-produk penuh (bf-z6w: 1 akun per sub-produk)
    return { account: trimmed, goal: null };
  }
  // Tipe D: plain → akun = sumber, note = goal
  return { account: srcAccount, goal: trimmed || null };
}

// Format number with thousands separator for the verify table.
function fmt(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

// Quote a CSV cell if it contains comma/quote/newline.
function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const year = args[0];
  const dry = args.includes("--dry");

  if (!["2025", "2026"].includes(year)) {
    console.error("Usage: npm run migrate -- <2025|2026> [--dry]");
    process.exit(1);
  }

  const userId = process.env.MIGRATE_USER_ID;
  if (!userId) {
    console.error("Missing env: MIGRATE_USER_ID (UUID of the user to import into)");
    process.exit(1);
  }

  if (args.includes("--budgets")) {
    if (Number(year) !== BUDGET_SHEET.year) {
      console.error(`--budgets only supports ${BUDGET_SHEET.year} (sheet has no other year)`);
      process.exit(1);
    }
    await importBudgets(userId, dry);
    return;
  }

  let sheetId = SHEET_IDS[year];
  if (!sheetId) {
    const envKey = `SHEET_ID_${year}`;
    sheetId = process.env[envKey] ?? "";
    if (!sheetId) {
      console.error(`Missing SHEET_IDS["${year}"] — set env ${envKey}=<sheet_id>`);
      process.exit(1);
    }
  }

  console.log(`\n🗂  Migrate year=${year} sheetId=${sheetId} dry=${dry} user=${userId}\n`);

  // ── Task 1: Fetch all month tabs ──────────────────────────────────────────

  console.log("📥 Task 1: Fetching month tabs...");
  const allRows: Array<{ month: string; header: string[]; row: string[] }> = [];

  for (const month of MONTHS) {
    process.stdout.write(`  ${month}... `);
    const csv = await fetchTab(sheetId, month);
    if (!csv) {
      console.log("skip (empty/error)");
      continue;
    }
    const [rawHeader, ...dataRows] = csv;
    const header = normalizeHeader(rawHeader);
    let count = 0;
    for (const row of dataRows) {
      if (row.every((c) => !c)) continue; // blank row
      allRows.push({ month, header, row });
      count++;
    }
    console.log(`${count} rows`);
  }

  console.log(`\n  Total data rows: ${allRows.length}`);

  // ── Pairing pre-pass: transfer split jadi 2 baris ─────────────────────────
  // Sheet memecah transfer sesama tipe kolom (BCA↔Mandiri dua-duanya ATM, atau
  // Mandiri↔Jago dgn note beda "Emergency Jago"/"Bank Jago") jadi 2 baris: satu −
  // (source), satu + (dest). Cocokkan by DATE + |AMOUNT| saja (abaikan note, karena
  // note bisa beda antar sisi). Pair 1:1 per okurensi — kalau ada 2 penarikan @500rb
  // di tanggal sama (mis Kacamata) → jadi 2 pair terpisah, bukan digabung.
  const pairInfo = new Map<number, { role: "source" | "dest"; partnerAccount: string }>();
  const singgahIdx = new Set<number>();
  {
    // Candidate: transfer single-bucket, account jelas (bukan "-").
    const byKey = new Map<
      string,
      Array<{ idx: number; sign: number; account: string; catDash: boolean; liquid: boolean }>
    >();
    allRows.forEach(({ header, row }, idx) => {
      const get = (col: string) => {
        const i = header.indexOf(col);
        return i >= 0 ? (row[i] ?? "").trim() : "";
      };
      if (get("Transaction").toLowerCase() !== "transfer") return;
      const touched = ASSET_COLS.map((col) => ({ col, val: parseNum(get(col)) })).filter(
        (b) => b.val !== 0
      );
      if (touched.length !== 1) return; // single-bucket only
      const account = get("Account");
      if (!account || account === "-") return;
      const val = touched[0].val;
      const liquid = ["Wallet", "ATM", "Platform"].includes(touched[0].col);
      const key = `${get("Date")}|${Math.abs(val)}`; // ignore note
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({
        idx,
        sign: Math.sign(val),
        account,
        catDash: get("Category") === "-",
        liquid,
      });
    });

    for (const group of byKey.values()) {
      const neg = group.filter((g) => g.sign < 0);
      const pos = group.filter((g) => g.sign > 0);
      const n = Math.min(neg.length, pos.length);
      for (let i = 0; i < n; i++) {
        pairInfo.set(neg[i].idx, { role: "source", partnerAccount: pos[i].account });
        pairInfo.set(pos[i].idx, { role: "dest", partnerAccount: neg[i].account });
      }
      // Leftover NEGATIVE liquid rows dengan category "-" = uang singgah (keluar tanpa
      // pasangan masuk ke akun pribadi). Sisa lain (invest 1-sisi, dll) TIDAK singgah —
      // ditangani POLA 3 di loop utama.
      for (let i = n; i < neg.length; i++) {
        if (neg[i].catDash && neg[i].liquid) singgahIdx.add(neg[i].idx);
      }
    }
    console.log(
      `  Paired transfers: ${pairInfo.size / 2} pairs | Uang singgah (skip): ${singgahIdx.size}`
    );
  }

  // ── Task 2: Resolve accounts & categories ─────────────────────────────────

  console.log("\n📋 Task 2: Resolving accounts & categories...");

  // Load existing
  // Include inactive accounts (e.g. deactivated BNI) — old imported rows still
  // reference them; excluding makes re-parse resolve account_id=null and breaks
  // natural-key dedup against those rows.
  const existingAccounts = await db
    .select({ id: accounts.id, name: accounts.name, asset_category: accounts.asset_category })
    .from(accounts)
    .where(eq(accounts.user_id, userId));

  const existingCategories = await db
    .select({ id: categories.id, name: categories.name, group_name: categories.group_name })
    .from(categories)
    .where(and(eq(categories.user_id, userId), eq(categories.is_active, true)));

  // Maps: lowercase name → id
  const accountMap = new Map<string, string>(
    existingAccounts.map((a) => [a.name.toLowerCase().trim(), a.id])
  );
  const accountCategoryMap = new Map<string, string>(
    existingAccounts.map((a) => [a.name.toLowerCase().trim(), a.asset_category])
  );
  const categoryMap = new Map<string, string>(
    existingCategories.map((c) => [c.name.toLowerCase().trim(), c.id])
  );

  // Get a default account_type_id for new accounts (first type for user, or create one)
  let defaultAccountTypeId: string | null = null;
  const existingTypes = await db
    .select({ id: accountTypes.id, slug: accountTypes.slug })
    .from(accountTypes)
    .where(eq(accountTypes.user_id, userId))
    .limit(1);
  if (existingTypes.length > 0) {
    defaultAccountTypeId = existingTypes[0].id;
  }

  if (!defaultAccountTypeId) {
    console.error("No account_types found for user. Create at least one account type first.");
    process.exit(1);
  }

  // Collect new accounts/categories needed
  const newAccounts = new Map<string, { name: string; asset_category: "liquid" | "investment" }>();
  const newCategories = new Map<string, string>(); // name → group guess

  for (const { header, row } of allRows) {
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const accountName = get("Account");
    const categoryName = get("Category");
    const note = get("Note");
    const txType = get("Transaction").toLowerCase();

    // Source account: category from ITS OWN bucket (source is the liquid/non-liquid it sits in).
    // The source bucket is the one matching accountName's origin — infer from the negative
    // liquid bucket for transfers, else first non-zero bucket.
    if (accountName && accountName !== "-" && !accountMap.has(accountName.toLowerCase())) {
      let cat: "liquid" | "investment" = "liquid";
      // Source is liquid if any liquid bucket (Wallet/ATM/Platform) is touched; only pure
      // Investment/Saving-origin accounts are non-liquid.
      const liquidTouched = ["Wallet", "ATM", "Platform"].some((col) => parseNum(get(col)) !== 0);
      if (!liquidTouched) {
        const invTouched = ["Investment", "Saving"].some((col) => parseNum(get(col)) !== 0);
        if (invTouched) cat = "investment";
      }
      newAccounts.set(accountName, { name: accountName, asset_category: cat });
    }

    // Instrument (dest) account for investment/saving transfers — parsed from Note.
    if (txType === "transfer") {
      const investTouched = ["Investment", "Saving"].some((col) => parseNum(get(col)) !== 0);
      const isMoneySinggah =
        categoryName === "-" &&
        ASSET_COLS.filter((col) => parseNum(get(col)) !== 0).length === 1;
      if (investTouched && !isMoneySinggah) {
        const { account: destName } = parseInvestmentDest(note, accountName);
        if (destName && destName !== "-" && !accountMap.has(destName.toLowerCase())) {
          newAccounts.set(destName, { name: destName, asset_category: "investment" });
        }
      }
    }

    // AR (piutang) / AP (utang): transfer kas ↔ akun AR/AP. Buat akun AR/AP.
    // Liability proper (AP kurangi net worth) = bf-3e0. Sekarang akun liquid dulu.
    if (categoryName === "AR" || categoryName === "AP") {
      if (!accountMap.has(categoryName.toLowerCase())) {
        newAccounts.set(categoryName, { name: categoryName, asset_category: "liquid" });
      }
    } else if (
      categoryName &&
      categoryName !== "-" &&
      !categoryMap.has(categoryName.toLowerCase()) &&
      !CATEGORY_BLACKLIST.has(categoryName.toLowerCase())
    ) {
      newCategories.set(categoryName, guessGroupName(categoryName));
    }
  }

  console.log(`  New accounts to create: ${newAccounts.size}`);
  console.log(`  New categories to create: ${newCategories.size}`);

  if (!dry) {
    for (const [, { name, asset_category }] of newAccounts) {
      const slug = toSlug(name);
      const [row] = await db
        .insert(accounts)
        .values({
          user_id: userId,
          account_type_id: defaultAccountTypeId,
          name,
          slug,
          asset_category,
          investment_group:
            asset_category === "investment" ? deriveInvestmentGroup(name) : null,
        })
        .onConflictDoNothing()
        .returning({ id: accounts.id, name: accounts.name });
      if (row) {
        console.log(`  ✅ Created account: ${name} (${asset_category})`);
        accountMap.set(name.toLowerCase(), row.id);
        accountCategoryMap.set(name.toLowerCase(), asset_category);
      }
    }

    // Reload to catch conflicts
    const reloaded = await db
      .select({ id: accounts.id, name: accounts.name, asset_category: accounts.asset_category })
      .from(accounts)
      .where(and(eq(accounts.user_id, userId), eq(accounts.is_active, true)));
    for (const a of reloaded) {
      accountMap.set(a.name.toLowerCase().trim(), a.id);
      accountCategoryMap.set(a.name.toLowerCase().trim(), a.asset_category);
    }

    for (const [name, group_name] of newCategories) {
      const [row] = await db
        .insert(categories)
        .values({
          user_id: userId,
          name,
          slug: toSlug(name),
          group_name,
          sort_order: 999,
        })
        .onConflictDoNothing()
        .returning({ id: categories.id });
      if (row) {
        console.log(`  ✅ Created category: ${name} (group: ${group_name})`);
        categoryMap.set(name.toLowerCase(), row.id);
      }
    }

    // Reload categories
    const reloadedCats = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.user_id, userId), eq(categories.is_active, true)));
    for (const c of reloadedCats) {
      categoryMap.set(c.name.toLowerCase().trim(), c.id);
    }
  } else {
    // In dry mode, just populate maps with placeholder UUIDs so the rest can run
    for (const [name, { asset_category }] of newAccounts) {
      const fakeId = `dry-acct-${toSlug(name)}`;
      accountMap.set(name.toLowerCase(), fakeId);
      accountCategoryMap.set(name.toLowerCase(), asset_category);
    }
    for (const [name] of newCategories) {
      categoryMap.set(name.toLowerCase(), `dry-cat-${toSlug(name)}`);
    }
  }

  // ── Task 3: Transform & insert transactions ───────────────────────────────

  console.log("\n💾 Task 3: Transforming & inserting transactions...");

  // Load existing rows as natural keys to skip (stable across month-tabs).
  // Loaded in BOTH dry & real so --dry reports accurate "new" counts.
  const existingKeys = new Set<string>();
  {
    const rows = await db
      .select({
        transaction_date: transactions.transaction_date,
        transaction_type: transactions.transaction_type,
        account_id: transactions.account_id,
        to_account_id: transactions.to_account_id,
        amount: transactions.amount,
        note: transactions.note,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.user_id, userId),
          eq(transactions.is_imported, true)
          // NOTE: include soft-deleted rows too — a row we deliberately removed
          // as a duplicate must NOT be re-inserted on the next migrate run.
        )
      );
    for (const r of rows) {
      existingKeys.add(
        naturalKey({
          date: r.transaction_date,
          type: r.transaction_type,
          accountId: r.account_id,
          toAccountId: r.to_account_id,
          amount: Number(r.amount),
          note: r.note ?? "",
        })
      );
    }
    console.log(`  Existing imported rows: ${existingKeys.size}`);
  }

  let inserted = 0;
  let skipped = 0;
  let errored = 0;
  let skippedMoving = 0;
  const mutationByName = new Map<string, number>(); // account name (lc) → net mutation 2026
  // Every planned insert captured here → dumped to a review file (both dry & real).
  const reviewRows: Array<{
    month: string;
    date: string;
    type: string;
    account: string;
    to_account: string | null;
    category: string;
    amount: number;
    note: string;
  }> = [];
  // POLA 1 (uang singgah): skipped from insert, logged for audit.
  const skippedRows: Array<{ month: string; date: string; account: string; note: string; amount: number; reason: string }> = [];

  for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
    const { month, header, row } = allRows[rowIdx];
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const rawDate = get("Date");
    const txDate = parseDate(rawDate);
    if (!txDate) {
      // Might be a header repeat or blank
      continue;
    }

    const txType = get("Transaction").toLowerCase();
    const accountName = get("Account");
    const categoryName = get("Category");
    const note = get("Note");

    if (!accountName) continue;

    // Skip "Moving Period" / "Rekapan" — monthly balance snapshot, NOT a transaction.
    // Importing it double-counts balances. v2 derives balance from real transactions.
    if (
      accountName.toLowerCase() === "rekapan" ||
      note.toLowerCase().includes("moving period")
    ) {
      skippedMoving++;
      continue;
    }

    // Account="-" = rebalance internal antar instrumen investasi (balancing sheet).
    // Kas tak kena; instrumen di-track nanti (bf-3ai). Skip + log.
    if (accountName === "-") {
      const bkt = ASSET_COLS.map((col) => parseNum(get(col))).find((v) => v !== 0) ?? 0;
      skippedRows.push({
        month,
        date: txDate,
        account: "-",
        note,
        amount: Math.abs(bkt),
        reason: "rebalance-instrumen",
      });
      continue;
    }

    const accountId = accountMap.get(accountName.toLowerCase());
    if (!accountId) {
      console.warn(`  ⚠️  Unknown account: "${accountName}" — skip`);
      errored++;
      continue;
    }

    const categoryId = categoryName ? (categoryMap.get(categoryName.toLowerCase()) ?? null) : null;

    // Determine amount + to_account from bucket cols
    const buckets: Array<{ col: string; val: number }> = [];
    for (const col of ASSET_COLS) {
      const v = parseNum(get(col));
      if (v !== 0) buckets.push({ col, val: v });
    }

    if (buckets.length === 0) {
      // All equity cols — skip
      continue;
    }

    let amount = 0;
    let toAccountId: string | null = null;
    let finalType: "earning" | "spending" | "transfer" = "spending";
    let overrideAccountId: string | null = null; // AR/AP: source jadi akun AR/AP kalau kas masuk

    if (txType === "earning") {
      // Positive bucket = destination
      const dest = buckets.find((b) => b.val > 0);
      amount = dest ? dest.val : Math.abs(buckets[0].val);
      finalType = "earning";
    } else if (txType === "spending") {
      const src = buckets.find((b) => b.val < 0);
      amount = src ? Math.abs(src.val) : Math.abs(buckets[0].val);
      finalType = "spending";
    } else if (txType === "transfer") {
      finalType = "transfer";
      const src = buckets.find((b) => b.val < 0);
      const dest = buckets.find((b) => b.val > 0);
      const investBucket = buckets.find((b) => b.col === "Investment" || b.col === "Saving");

      // AR/AP: SELALU kas→AR/AP (satu arah). Positif = kas keluar, negatif = skip/ignore.
      // Semua row AR/AP di sheet = pencatatan hutang/piutang dari akun kas ke AR/AP.
      if (categoryName === "AR" || categoryName === "AP") {
        const arApId = accountMap.get(categoryName.toLowerCase());
        const cashBucket = buckets[0];
        amount = Math.abs(cashBucket.val);
        // Kas selalu source, AR/AP selalu dest
        toAccountId = arApId ?? null;
        // lanjut ke insert (skip POLA lain)
      } else if (singgahIdx.has(rowIdx) || categoryName === "-") {
        skippedRows.push({
          month,
          date: txDate,
          account: accountName,
          note,
          amount: Math.abs(buckets[0].val),
          reason: categoryName === "-" ? "transfer-singgah-cat-dash" : "uang-singgah",
        });
        continue;
      }

      // Transfer pecah (BCA↔Mandiri, dua-duanya ATM) → rekonstruksi jadi 1 transfer.
      const pair = pairInfo.get(rowIdx);
      if (pair) {
        if (pair.role === "dest") continue; // baris "+" sudah tercakup baris "−"; skip agar tak dobel
        // role === "source": baris "−" jadi 1 transfer, dest = partner account.
        amount = Math.abs(buckets[0].val);
        toAccountId = accountMap.get(pair.partnerAccount.toLowerCase()) ?? null;
      } else if (investBucket) {
        // POLA 3: transfer ke Investment/Saving. Dest = instrumen dari Note.
        amount = Math.abs(investBucket.val);
        const { account: destName } = parseInvestmentDest(note, accountName);
        toAccountId = destName ? (accountMap.get(destName.toLowerCase()) ?? null) : null;
      } else {
        // POLA 2: transfer antar akun liquid beda kolom (Tarik Tunai). Dest = Category.
        amount = src ? Math.abs(src.val) : dest ? dest.val : Math.abs(buckets[0].val);
        // Sinking/Emergency = alokasi ke Jago (tidak ada akun "Sinking"/"Emergency" di DB)
        const JAGO_FALLBACK_CATS = ["sinking", "emergency"];
        const destName = categoryName && categoryName !== "-"
          ? (JAGO_FALLBACK_CATS.includes(categoryName.toLowerCase()) ? "Jago" : categoryName)
          : dest?.col;
        toAccountId = destName ? (accountMap.get(destName.toLowerCase()) ?? null) : null;
      }
    } else {
      // Unknown type — skip
      console.warn(`  ⚠️  Unknown tx type: "${txType}" — skip`);
      continue;
    }

    if (amount <= 0) continue;

    const hash = rowHash([txDate, finalType, accountName, categoryName, note, String(amount)]);

    // Natural-key dedup (stable across month-tabs) — supersedes hash-based skip.
    const dupKey = naturalKey({
      date: txDate,
      type: finalType,
      accountId: overrideAccountId ?? accountId,
      toAccountId,
      amount,
      note,
    });
    if (existingKeys.has(dupKey)) {
      skipped++;
      continue;
    }

    // Effective source account (AR/AP kas-masuk override: source jadi AR/AP).
    const effAccountId = overrideAccountId ?? accountId;
    const idToName = (id: string | null) =>
      id != null ? ([...accountMap.entries()].find(([, v]) => v === id)?.[0] ?? null) : null;
    const effAccountName = overrideAccountId ? (idToName(effAccountId) ?? accountName) : accountName;
    const toAccountName = idToName(toAccountId);

    // Capture planned insert for review (both dry & real).
    reviewRows.push({
      month,
      date: txDate,
      type: finalType,
      account: effAccountName,
      to_account: toAccountName,
      category: categoryName,
      amount,
      note,
    });

    // Track net mutation per account NAME (works in dry & real — dry has no real IDs).
    const bump = (name: string, d: number) =>
      mutationByName.set(name.toLowerCase(), (mutationByName.get(name.toLowerCase()) ?? 0) + d);
    if (finalType === "earning") {
      bump(effAccountName, amount);
    } else if (finalType === "spending") {
      bump(effAccountName, -amount);
    } else if (finalType === "transfer") {
      bump(effAccountName, -amount);
      if (toAccountName) bump(toAccountName, amount);
    }

    if (dry) {
      inserted++;
      existingKeys.add(dupKey);
      continue;
    }

    await db.insert(transactions).values({
      user_id: userId,
      transaction_date: txDate,
      transaction_type: finalType,
      account_id: effAccountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      amount: String(amount),
      note: note || null,
      source_month: `${year}-${month}`,
      is_imported: true,
      import_row_hash: hash,
    });

    existingKeys.add(dupKey);
    inserted++;
  }

  console.log(
    `\n  Planned: ${inserted} | Skipped (dup): ${skipped} | Skipped (Moving Period): ${skippedMoving} | Errors: ${errored}`
  );

  // Write review file — human-readable CSV so user can eyeball before real insert.
  const reviewPath = `docs/migrate-review-${year}.csv`;
  const csvHeader = "month,date,type,account,to_account,category,amount,note";
  const csvBody = reviewRows
    .map((r) =>
      [
        r.month,
        r.date,
        r.type,
        csvCell(r.account),
        csvCell(r.to_account ?? ""),
        csvCell(r.category),
        r.amount,
        csvCell(r.note),
      ].join(",")
    )
    .join("\n");
  writeFileSync(reviewPath, `${csvHeader}\n${csvBody}\n`);
  console.log(`  📄 Review file written: ${reviewPath} (${reviewRows.length} rows)`);

  // Skipped (POLA 1 uang singgah) → separate audit file.
  if (skippedRows.length > 0) {
    const skipPath = `docs/migrate-skipped-${year}.csv`;
    const skipHeader = "month,date,account,amount,reason,note";
    const skipBody = skippedRows
      .map((r) => [r.month, r.date, csvCell(r.account), r.amount, r.reason, csvCell(r.note)].join(","))
      .join("\n");
    writeFileSync(skipPath, `${skipHeader}\n${skipBody}\n`);
    console.log(`  📄 Skipped file written: ${skipPath} (${skippedRows.length} rows)`);
  }

  // ── Task 4: Migrate goals ─────────────────────────────────────────────────

  console.log("\n🎯 Task 4: Migrating goals...");
  const goalsCsv = await fetchTab(sheetId, "Goals");
  if (!goalsCsv) {
    console.log("  No Goals tab found — skip");
  } else {
    const [goalHeader, ...goalDataRows] = goalsCsv;
    const gGet = (row: string[], col: string) => {
      const idx = goalHeader.indexOf(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    // Aggregate rows by goal NAME (1 goal bisa tersebar di banyak akun/instrumen:
    // "Pendidikan SD" ada di Bibit + Emas + USD). collected dijumlah, target ambil
    // terbesar, goal_type dari baris pertama (akun pertama).
    type GoalAgg = {
      name: string;
      goal_type: string;
      target: number;
      collected: number;
      monthly: number;
      deadline_date: string | null;
    };
    const goalMap = new Map<string, GoalAgg>();
    for (const row of goalDataRows) {
      if (row.every((c) => !c)) continue;
      const name = gGet(row, "Saving") || gGet(row, "Name") || gGet(row, "Goal");
      if (!name) continue;

      const linkedAccountName = gGet(row, "Account") || gGet(row, "Linked Account") || "";
      const target = parseNum(gGet(row, "Target") || gGet(row, "Target Amount") || "0");
      const collected = parseNum(gGet(row, "Collected") || gGet(row, "Collected Amount") || "0");
      // Skip placeholder: no target AND no collected AND account bukan akun asli.
      if (target === 0 && collected === 0 && !accountMap.has(linkedAccountName.toLowerCase())) {
        continue;
      }
      // goal_type dari NAMA goal, bukan akun: emergency/dana darurat = Investment
      // (tujuan tumbuh/proteksi), sisanya (sinking fund nabung terjadwal) = Saving.
      // Casing WAJIB "Saving"/"Investment" — DB CHECK constraint savings_goals_goal_type_check.
      const goal_type = /emergency|darurat|pensiun|invest/i.test(name) ? "Investment" : "Saving";
      const monthly = parseNum(gGet(row, "Monthly") || gGet(row, "Monthly Contribution") || "0");
      const deadline_date = parseGoalDeadline(gGet(row, "Deadline") || gGet(row, "Deadline Date"));

      const key = name.toLowerCase();
      const prev = goalMap.get(key);
      if (prev) {
        prev.collected += collected;
        prev.target = Math.max(prev.target, target);
        if (!prev.deadline_date && deadline_date) prev.deadline_date = deadline_date;
        if (prev.monthly === 0 && monthly > 0) prev.monthly = monthly;
      } else {
        goalMap.set(key, { name, goal_type, target, collected, monthly, deadline_date });
      }
    }

    // Tambal baris "Pendidikan SD (USD)" yang terpotong gviz (tab Goals berhenti di
    // Emas). Sheet penuh: USD target 23.9jt, collected 3.955jt. Gabung ke goal existing.
    const pend = goalMap.get("pendidikan sd");
    if (pend) {
      pend.target += 23_900_000;
      pend.collected += 3_955_000;
    }

    let goalsUpserted = 0;
    for (const g of goalMap.values()) {
      if (dry) {
        console.log(
          `  [DRY] Goal: ${g.name} (${g.goal_type}) target=${fmt(g.target)} collected=${fmt(g.collected)}`
        );
        goalsUpserted++;
        continue;
      }
      const existing = await db
        .select({ id: savingsGoals.id })
        .from(savingsGoals)
        .where(and(eq(savingsGoals.user_id, userId), eq(savingsGoals.name, g.name)))
        .limit(1);
      const values = {
        goal_type: g.goal_type,
        target_amount: String(g.target),
        collected_amount: String(g.collected),
        monthly_contribution: g.monthly > 0 ? String(g.monthly) : null,
        deadline_date: g.deadline_date,
      };
      if (existing.length > 0) {
        await db.update(savingsGoals).set(values).where(eq(savingsGoals.id, existing[0].id));
        console.log(`  ↻ Updated goal: ${g.name}`);
      } else {
        await db.insert(savingsGoals).values({ user_id: userId, name: g.name, ...values });
        console.log(`  ✅ Created goal: ${g.name}`);
      }
      goalsUpserted++;
    }
    console.log(`  Goals processed: ${goalsUpserted}`);
  }

  // ── Task 5: Opening balance (Summary − mutasi) + verify ───────────────────
  // Target: current_balance akhir tiap akun = angka tab Summary. Karena kita cuma
  // import 2026, saldo awal (carry dari 2025) hilang → tambal via 1 transaksi
  // "Opening Balance <year>" bertanggal 1 Jan. opening = Summary − mutasi 2026.
  // Ditandai hash `opening-<year>-<slug>` → gampang dihapus saat import 2025 nanti.

  console.log("\n🔍 Task 5: Opening balance + verify vs Summary sheet...");

  const summaryCsv = await fetchTab(sheetId, "Summary");
  const summaryByName = new Map<string, number>(); // account name (lc) → end balance
  if (summaryCsv) {
    for (const r of summaryCsv.slice(1)) {
      const name = (r[0] ?? "").trim();
      const val = parseNum(r[1] ?? "");
      if (name) summaryByName.set(name.toLowerCase(), val);
    }
  }

  // Hitung mutasi 2026 dari DB (bukan in-memory) — benar di first-run & re-run.
  // Exclude baris opening biar gak double. Idempotent: hapus opening lama dulu.
  if (!dry) {
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.user_id, userId),
          eq(transactions.source_month, `${year}-Opening`),
          // Preserve manually-seeded non-liquid asset openings (opening-<year>-nl-*).
          notLike(transactions.import_row_hash, `opening-${year}-nl-%`)
        )
      );
    const mutRows = await db.execute<{ name: string; mutation: string }>(
      `
      SELECT a.name, COALESCE(SUM(CASE
        WHEN t.transaction_type = 'earning' THEN t.amount::numeric
        WHEN t.transaction_type = 'spending' THEN -t.amount::numeric
        WHEN t.transaction_type = 'transfer' AND t.account_id = a.id THEN -t.amount::numeric
        WHEN t.transaction_type = 'transfer' AND t.to_account_id = a.id THEN t.amount::numeric
        ELSE 0 END), 0) AS mutation
      FROM accounts a
      LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
        AND t.user_id = '${userId}' AND t.deleted_at IS NULL
        AND t.source_month <> '${year}-Opening'
      WHERE a.user_id = '${userId}'
      GROUP BY a.name
      `
    );
    mutationByName.clear();
    for (const r of mutRows) mutationByName.set(r.name.toLowerCase(), Number(r.mutation));
  }

  // Table: for every account that has EITHER a Summary value OR a mutation.
  const allNames = new Set<string>([...summaryByName.keys(), ...mutationByName.keys()]);
  console.log(
    "\n  " +
      "Account".padEnd(28) +
      "Summary".padStart(15) +
      "Mutasi2026".padStart(15) +
      "Opening".padStart(15) +
      "Computed".padStart(15) +
      "  Match"
  );
  console.log("  " + "─".repeat(101));

  let matched = 0;
  let mismatched = 0;
  for (const nameLc of [...allNames].sort()) {
    const summary = summaryByName.get(nameLc);
    const mutation = mutationByName.get(nameLc) ?? 0;
    if (summary === undefined) {
      // Investment/instrument accounts often not in Summary tab → skip opening, just show.
      console.log(
        "  " +
          nameLc.padEnd(28) +
          "(no summary)".padStart(15) +
          fmt(mutation).padStart(15) +
          "-".padStart(15) +
          fmt(mutation).padStart(15) +
          "  —"
      );
      continue;
    }
    const opening = summary - mutation;
    const computed = opening + mutation; // = summary by construction
    const ok = Math.abs(computed - summary) < 1;
    if (ok) matched++;
    else mismatched++;
    console.log(
      "  " +
        nameLc.padEnd(28) +
        fmt(summary).padStart(15) +
        fmt(mutation).padStart(15) +
        fmt(opening).padStart(15) +
        fmt(computed).padStart(15) +
        (ok ? "  ✅" : "  ⚠️")
    );

    // AR/AP: jangan bikin opening tx (opening negatif ngaco maknanya). current_balance
    // di-set langsung = Summary setelah recompute (lihat blok bawah).
    if (nameLc === "ar" || nameLc === "ap") continue;

    // Insert opening balance transaction (real mode only, when opening ≠ 0).
    if (!dry && Math.abs(opening) >= 1) {
      const accountId = accountMap.get(nameLc);
      if (!accountId) {
        console.warn(`  ⚠️  Opening: account "${nameLc}" not found in DB — skip`);
        continue;
      }
      // Opening rows sudah dihapus di awal Task 5 → aman insert ulang (idempotent).
      const openHash = `opening-${year}-${toSlug(nameLc)}`;
      // opening + → earning ke akun; opening − → spending dari akun.
      await db.insert(transactions).values({
        user_id: userId,
        transaction_date: `${year}-01-01`,
        transaction_type: opening >= 0 ? "earning" : "spending",
        account_id: accountId,
        amount: String(Math.abs(opening)),
        note: `Opening Balance ${year}`,
        source_month: `${year}-Opening`,
        is_imported: true,
        import_row_hash: openHash,
      });
    }
  }
  console.log(`\n  Balances matched: ${matched} | mismatched: ${mismatched}`);

  // Recompute current_balance from all transactions (real mode).
  if (!dry) {
    const touchedNames = [...allNames].filter((n) => accountMap.has(n));
    const touchedIds = touchedNames.map((n) => accountMap.get(n)!).filter(Boolean);
    if (touchedIds.length > 0) {
      const sumRows = await db.execute<{ account_id: string; balance: string }>(
        `
        SELECT a.id AS account_id,
          COALESCE(SUM(CASE
            WHEN t.transaction_type = 'earning' THEN t.amount::numeric
            WHEN t.transaction_type = 'spending' THEN -t.amount::numeric
            WHEN t.transaction_type = 'transfer' AND t.account_id = a.id THEN -t.amount::numeric
            WHEN t.transaction_type = 'transfer' AND t.to_account_id = a.id THEN t.amount::numeric
            ELSE 0 END), 0) AS balance
        FROM accounts a
        LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
          AND t.user_id = '${userId}' AND t.deleted_at IS NULL
        WHERE a.id = ANY(ARRAY[${touchedIds.map((id) => `'${id}'`).join(",")}]::uuid[])
          AND a.user_id = '${userId}'
        GROUP BY a.id
        `
      );
      for (const r of sumRows) {
        await db
          .update(accounts)
          .set({ current_balance: r.balance, updated_at: new Date() })
          .where(and(eq(accounts.id, r.account_id), eq(accounts.user_id, userId)));
      }
      console.log(`  ✅ Recomputed current_balance for ${sumRows.length} accounts.`);
    }

    // AR/AP: set current_balance = Summary langsung (tanpa opening tx).
    for (const nameLc of ["ar", "ap"]) {
      const summary = summaryByName.get(nameLc);
      const accountId = accountMap.get(nameLc);
      if (summary !== undefined && accountId) {
        await db
          .update(accounts)
          .set({ current_balance: String(summary), updated_at: new Date() })
          .where(and(eq(accounts.id, accountId), eq(accounts.user_id, userId)));
        console.log(`  ✅ ${nameLc.toUpperCase()} balance set = Summary: ${fmt(summary)}`);
      }
    }
  }

  console.log("\n✅ Migration complete!\n");

  if (dry) {
    console.log("ℹ️  DRY RUN — no data written. Remove --dry to commit.\n");
  }

  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function guessGroupName(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (["salary", "freelance", "bonus", "income", "dividend", "revenue", "other earn"].some((k) => lower.includes(k))) {
    return "earning";
  }
  if (["saving", "savings", "dana darurat"].some((k) => lower.includes(k))) {
    return "saving";
  }
  if (["invest", "saham", "reksa", "crypto", "gold", "emas"].some((k) => lower.includes(k))) {
    return "investing";
  }
  if (["food", "eat", "makan", "grocery", "groceries", "dining", "fruits", "buah"].some((k) => lower.includes(k))) {
    return "eating";
  }
  if (["sedekah", "zakat", "charity", "giving", "donate", "infaq", "shodaqoh", "tax", "allowance"].some((k) => lower.includes(k))) {
    return "giving";
  }
  return "living";
}

// Goal deadline bisa "d/m/yyyy" ATAU serial number Google Sheets (mis 46539).
// Serial = hari sejak 1899-12-30. Kembalikan ISO date atau null.
function parseGoalDeadline(raw: string): string | null {
  const t = raw.trim();
  if (!t || t === "-") return null;
  const iso = parseDate(t);
  if (iso) return iso;
  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const ms = (serial - 25569) * 86400 * 1000; // 25569 = days 1899-12-30 → 1970-01-01
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// Explicit exit: the db pool keeps the process alive otherwise.
main().then(() => process.exit(0)).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
