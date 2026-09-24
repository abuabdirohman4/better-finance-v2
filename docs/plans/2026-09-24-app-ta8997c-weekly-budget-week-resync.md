# app-ta8997c — Weekly budget: week selection resync saat ganti bulan

## Context

Bug: di `/budgets/weekly`, setelah ganti bulan/tahun lewat dropdown, tab "Week N" yang aktif tetap nilai lama (mis. Week 4 dari Sep ikut terbawa ke Aug). Kalau bulan baru punya minggu lebih sedikit (Week 5/6 → bulan 4 minggu), tidak ada tab yang aktif dan `spendingPerWeek[selectedWeek - 1]` = `undefined` → angka NaN/kosong.

Diagnosis (sudah diverifikasi terhadap kode):

1. `src/app/(app)/budgets/weekly/_hooks/useWeeklyBudget.ts:16` — `useState(defaultWeek)` hanya pakai `defaultWeek` saat mount. `defaultWeek` (`:15`) dihitung ulang via `useMemo` saat `year`/`month` berubah (dropdown `page.tsx:48`, `:60`), tapi state tidak ikut. **Ini akar bug.**
2. `src/app/(app)/budgets/weekly/_utils/dateCalculations.ts:84` — `getCurrentWeekNumber` return `1` untuk bulan selain bulan berjalan. Perilaku ini **benar dan dipertahankan**, cuma dibuat eksplisit (komentar) + fungsi dapat parameter `now` opsional supaya bisa di-test. `:89` (`return 1` setelah loop) praktis tak terjangkau (hari ini selalu ≥ tanggal 1 bulan berjalan) — biarkan, beri komentar.

Keputusan perilaku:
- Bulan berjalan → minggu berjalan.
- Bulan lain → Week 1 (disengaja).
- Ganti bulan/tahun → pilihan week manual dibuang, balik ke default bulan baru. Kembali ke bulan semula juga balik ke default (tidak mengingat pilihan lama).
- Kasus "week lama > jumlah minggu bulan baru" otomatis tertangani: pilihan manual hanya berlaku untuk bulan tempat dia dipilih, jadi nilainya selalu ≤ `weeksInMonth` bulan itu; `defaultWeek` juga selalu dalam rentang. Tidak perlu clamp terpisah.

Pola yang dipilih: **derived state** (simpan pilihan bersama `monthKey`-nya; kalau key beda, pakai `defaultWeek`). Tanpa `useEffect`, tanpa render ganda, tanpa ubah `page.tsx`. Alternatif ditolak: `useEffect` + setState (render stale sekali, anti-pattern React); key-remount (harus pecah page jadi komponen anak → diff lebih besar); "reset during render" dengan `prevKey` state (benar juga, tapi 2 state + setState saat render — derived lebih kecil).

## Files touched (3)

| File | Aksi |
|---|---|
| `src/app/(app)/budgets/weekly/_hooks/useWeeklyBudget.ts` | edit — ganti state `selectedWeek` |
| `src/app/(app)/budgets/weekly/_utils/dateCalculations.ts` | edit — param `now` opsional + komentar eksplisit |
| `src/app/(app)/budgets/weekly/__tests__/dateCalculations.test.ts` | **baru** — unit test kecil |

`page.tsx` **tidak** diubah (API hook tetap: `selectedWeek: number`, `setSelectedWeek(w: number)`).

## Step 1 — `useWeeklyBudget.ts`

**Before** (baris 13–16):

```ts
export function useWeeklyBudget(year: number, month: number) {
  const weeksInMonth = useMemo(() => getAllWeekInfos(year, month).length, [year, month]);
  const defaultWeek = useMemo(() => getCurrentWeekNumber(year, month), [year, month]);
  const [selectedWeek, setSelectedWeek] = useState(defaultWeek);
```

**After:**

```ts
export function useWeeklyBudget(year: number, month: number) {
  const weeksInMonth = useMemo(() => getAllWeekInfos(year, month).length, [year, month]);
  const defaultWeek = useMemo(() => getCurrentWeekNumber(year, month), [year, month]);

  // Pilihan week terikat ke bulannya — ganti bulan/tahun otomatis balik ke defaultWeek.
  const monthKey = `${year}-${month}`;
  const [picked, setPicked] = useState<{ monthKey: string; week: number } | null>(null);
  const selectedWeek = picked?.monthKey === monthKey ? picked.week : defaultWeek;
  const setSelectedWeek = (week: number) => setPicked({ monthKey, week });
```

Sisa file tidak berubah. `selectedWeek` tetap ada di deps `useMemo` `weeklyData` (baris 62) — tetap benar karena sekarang nilai turunan. Import `useState, useMemo` sudah ada.

## Step 2 — `dateCalculations.ts`

**Before** (baris 81–90):

```ts
/** Hitung minggu aktif saat ini (1-based) */
export function getCurrentWeekNumber(year: number, month: number): number {
  const now = new Date();
  if (now.getFullYear() !== year || now.getMonth() + 1 !== month) return 1;
  const infos = getAllWeekInfos(year, month);
  for (let i = infos.length - 1; i >= 0; i--) {
    if (now >= infos[i].startDate) return i + 1;
  }
  return 1;
}
```

**After:**

```ts
/**
 * Week default saat membuka bulan (1-based): bulan berjalan → minggu berjalan,
 * bulan lain (lalu/depan) → Week 1 (disengaja, bukan fallback).
 */
export function getCurrentWeekNumber(year: number, month: number, now: Date = new Date()): number {
  if (now.getFullYear() !== year || now.getMonth() + 1 !== month) return 1;
  const infos = getAllWeekInfos(year, month);
  for (let i = infos.length - 1; i >= 0; i--) {
    if (now >= infos[i].startDate) return i + 1;
  }
  return 1; // tak terjangkau: now selalu ≥ tanggal 1 bulan berjalan
}
```

Caller satu-satunya (`useWeeklyBudget.ts:15`) tetap memanggil 2 argumen — tidak perlu diubah.

## Step 3 — test baru `src/app/(app)/budgets/weekly/__tests__/dateCalculations.test.ts`

Path cocok dengan `include` di `vitest.config.ts` (`src/**/__tests__/**/*.test.ts`). Referensi kalender: 1 Sep 2026 = Selasa → Week1 1–6 Sep, Week2 7–13, Week3 14–20, Week4 21–27, Week5 28–30 (5 minggu).

```ts
import { describe, it, expect } from "vitest";
import { getCurrentWeekNumber, getWeeksInMonth } from "../_utils/dateCalculations";

describe("getCurrentWeekNumber", () => {
  const sep24 = new Date(2026, 8, 24, 10, 0);

  it("bulan berjalan → minggu berjalan", () => {
    expect(getWeeksInMonth(2026, 9)).toBe(5);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 1, 8, 0))).toBe(1);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 7, 0, 0))).toBe(2);
    expect(getCurrentWeekNumber(2026, 9, sep24)).toBe(4);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 30, 23, 0))).toBe(5);
  });

  it("bulan/tahun lain → Week 1", () => {
    expect(getCurrentWeekNumber(2026, 8, sep24)).toBe(1);
    expect(getCurrentWeekNumber(2026, 10, sep24)).toBe(1);
    expect(getCurrentWeekNumber(2025, 9, sep24)).toBe(1);
  });
});
```

Hook tidak di-unit-test (project tak punya testing-library; logika hook cuma satu ternary) — diverifikasi manual di bawah.

## Step 4 — gerbang mutu (dijalankan USER, bukan executor)

```bash
npm run test:run   # test baru harus hijau
npm run build      # wajib lolos sebelum close issue
```

## Verifikasi manual (user, `npm run dev` → `/budgets/weekly`)

1. Buka halaman (hari ini 24 Sep 2026) → tab **Week 4** aktif.
2. Klik **Week 5** → aktif. Ganti bulan ke **Feb** (4 minggu) → tab **Week 1** aktif, kartu tampil angka normal (bukan NaN/kosong).
3. Klik **Week 3** di Feb → ganti ke **Aug** → **Week 1** aktif (bukan Week 3).
4. Ganti balik ke **Sep** → **Week 4** aktif (minggu berjalan).
5. Di Sep, ganti tahun ke **2025** → **Week 1** aktif; balik ke **2026** → **Week 4**.
6. Klik tab week mana saja di bulan yang sama → pindah normal, data kartu ikut berubah.

## Dokumentasi

Tidak ada pattern/konvensi baru → AGENTS.md, README.md, roadmap tidak perlu diubah.
