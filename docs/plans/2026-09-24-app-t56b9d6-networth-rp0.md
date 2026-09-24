# app-t56b9d6 — Net Worth di home tampil Rp 0 saat balik dari halaman lain

Mode: B (direct) — 4 file, < 30 baris.

## Root cause (sudah diverifikasi di kode)

- `QueryProvider` dipasang di `src/app/layout.tsx` → satu `QueryClient` hidup selama sesi; cache TIDAK hilang karena navigasi client.
- TanStack Query v5 (`^5.101.2`): kalau cache ada dan refetch gagal, `data` **tetap** berisi data lama (`isError` true, `data` terisi). Jadi refetch gagal saja **tidak** menyebabkan Rp 0.
- `data` benar-benar `undefined` hanya kalau cache sudah kosong: query dashboard **tidak aktif** (home tidak ter-mount) lebih lama dari `gcTime` default **5 menit** → cache di-GC. Saat balik ke home: fetch baru → `isLoading` (skeleton) → kalau fetch gagal setelah `retry: 2` (mis. `requireUser()` lempar Unauthorized di `src/app/(app)/actions.ts:13`) → `isLoading=false, isError=true, data=undefined`.
- Di state itu `page.tsx:89` render `formatCurrency(data?.totalAssets ?? 0)` → **Rp 0**. Tidak ada cabang `isError` di kartu Net Worth (Recent Transactions punya, `page.tsx:138`).
- Query yang sama juga membuat **Top Used Accounts** bohong: `topAccounts` = `[]` → `EmptyCard "No accounts yet"` (page.tsx:108-117) padahal gagal load.
- `placeholderData` (usulan awal) **tidak menolong**: queryKey dashboard statis (`["dashboard"]`), `keepPreviousData` hanya berguna saat key berubah; setelah GC tidak ada data sebelumnya. Jangan ditambahkan.
- Sebaliknya: cabang `isError` di Recent Transactions saat ini **menyembunyikan data cache yang valid** bila refetch background gagal. Ikut dirapikan jadi `isError && !data`.

## Perbaikan

1. `gcTime: Infinity` untuk query dashboard → balik ke home setelah >5 menit tetap tampil angka terakhir sambil refetch (staleTime 30s tetap memicu refetch saat mount). Payload kecil, satu key — aman.
2. Kartu Net Worth + Top Accounts: cabang error **hanya kalau tidak ada data** (`isError && !data`). Ada data → tampil angka/kartu cache.
3. Recent Transactions: `isError` → `isError && !data` (konsisten).

## Step 1 — `src/app/(app)/_hooks/useDashboard.ts`

Before:
```ts
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const res = await getDashboard();
      if (!res.success) throw new Error(res.message ?? "Failed to load dashboard");
      return res.data!;
    },
  });
}
```

After:
```ts
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const res = await getDashboard();
      if (!res.success) throw new Error(res.message ?? "Failed to load dashboard");
      return res.data!;
    },
    // Keep last numbers in cache across navigation; default 5-min GC caused the Rp 0 flash (app-t56b9d6).
    gcTime: Infinity,
  });
}
```

## Step 2 — `src/app/(app)/page.tsx`

### 2a. Tambah flag di bawah deklarasi `tt` (setelah baris 23)

Before:
```tsx
  const tt = useTranslations("transactions");

  const displayName = data?.user.displayName ?? "";
```

After:
```tsx
  const tt = useTranslations("transactions");
  // Error only matters when there is no cached data to show — never render Rp 0 / empty for a failure.
  const loadFailed = isError && !data;

  const displayName = data?.user.displayName ?? "";
```

### 2b. Kartu Net Worth (baris 85-91)

Before:
```tsx
          {isLoading ? (
            <div className="animate-pulse bg-gray-200 h-10 w-48 rounded" />
          ) : (
            <p className="text-3xl font-bold text-gray-900">
              {hideBalances ? MASK : formatCurrency(data?.totalAssets ?? 0)}
            </p>
          )}
```

After:
```tsx
          {isLoading ? (
            <div className="animate-pulse bg-gray-200 h-10 w-48 rounded" />
          ) : loadFailed || !data ? (
            <p className="text-sm text-red-600">{td("loadFailed")}</p>
          ) : (
            <p className="text-3xl font-bold text-gray-900">
              {hideBalances ? MASK : formatCurrency(data.totalAssets)}
            </p>
          )}
```
(`|| !data` = narrowing TS + jaring pengaman; `?? 0` dihapus supaya tak ada jalur yang bisa render Rp 0 palsu.)

### 2c. Top Used Accounts (baris 102-118)

Before:
```tsx
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse bg-white rounded-2xl h-32 shadow-lg" />
              ))}
            </div>
          ) : topAccounts.length > 0 ? (
```

After:
```tsx
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse bg-white rounded-2xl h-32 shadow-lg" />
              ))}
            </div>
          ) : loadFailed ? (
            <EmptyCard text={ta("loadFailed")} />
          ) : topAccounts.length > 0 ? (
```
(Reuse key `accounts.loadFailed` yang sudah ada — "⚠️ Failed to load accounts." / "⚠️ Gagal memuat akun.")

### 2d. Recent Transactions (baris 138)

Before:
```tsx
          ) : isError ? (
            <p className="text-sm text-red-600">{tt("loadFailed")}</p>
```

After:
```tsx
          ) : loadFailed ? (
            <p className="text-sm text-red-600">{tt("loadFailed")}</p>
```

## Step 3 — i18n key baru `dashboard.loadFailed`

`src/i18n/messages/en.json` — Before:
```json
  "dashboard": {
    "netWorth": "Net Worth",
    "topAccounts": "Top Used Accounts",
    "recentTransactions": "Recent Transactions"
  },
```
After:
```json
  "dashboard": {
    "netWorth": "Net Worth",
    "topAccounts": "Top Used Accounts",
    "recentTransactions": "Recent Transactions",
    "loadFailed": "⚠️ Failed to load net worth."
  },
```

`src/i18n/messages/id.json` — Before:
```json
  "dashboard": {
    "netWorth": "Kekayaan Bersih",
    "topAccounts": "Akun Sering Dipakai",
    "recentTransactions": "Transaksi Terbaru"
  },
```
After:
```json
  "dashboard": {
    "netWorth": "Kekayaan Bersih",
    "topAccounts": "Akun Sering Dipakai",
    "recentTransactions": "Transaksi Terbaru",
    "loadFailed": "⚠️ Gagal memuat kekayaan bersih."
  },
```

## Out of scope (jangan disentuh)

- Literal "View All" di page.tsx (i18n terpisah).
- Penyebab kegagalan server (`requireUser` Unauthorized / session expiry) — kalau error ini sering muncul, buka issue terpisah soal refresh session.
- `placeholderData` — tidak relevan (lihat root cause).

## Verifikasi (user jalankan, bukan executor)

1. `npm run test:run` → `src/i18n/__tests__/messages.test.ts` hijau (key en/id identik).
2. `npm run build` lolos (type-safe key `td("loadFailed")`).
3. Manual, `npm run dev`, buka `/`:
   - **Error tanpa cache**: buka React Query Devtools (ikon bunga di pojok) → query `["dashboard"]` → klik **Remove**, lalu **Trigger Error** (atau: pindah ke `/transactions`, Devtools → Remove `["dashboard"]`, set DevTools Network → Offline, balik ke `/`, tunggu ~3 detik retry). Harapan: Net Worth tampil "⚠️ Failed to load net worth.", Top Accounts "⚠️ Failed to load accounts.", Recent Transactions "⚠️ Failed to load transactions." — **tidak ada "Rp 0" / "No accounts yet"**.
   - **Error dengan cache**: di `/` dengan data tampil → Devtools → **Trigger Error** saja (tanpa Remove). Harapan: angka Net Worth, kartu akun, dan transaksi terakhir **tetap tampil**.
   - **Balik >5 menit**: pindah ke `/transactions`, tunggu >5 menit, kembali ke `/`. Harapan: angka langsung tampil (bukan skeleton lalu Rp 0), lalu tersegarkan.
   - Ganti locale ke `id` di `/settings`, ulangi skenario pertama → teks Indonesia.
