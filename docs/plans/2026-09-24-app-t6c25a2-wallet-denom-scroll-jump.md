# app-t6c25a2 — fix: halaman melompat turun setelah input pecahan wallet

**Mode:** B (direct) — 2 file, ~40 baris. Tidak ada i18n key baru, tidak ada query/action/hook baru.

## Diagnosis (sudah diverifikasi ke kode, 2026-09-24)

Tidak ada scroll management di `src/` (grep `scrollIntoView|overflow-anchor|placeholderData` = 0 hasil).
Catatan: `overflow-anchor` (scroll anchoring) tidak didukung iOS Safari, jadi di PWA iOS setiap
perubahan tinggi DI ATAS elemen yang sedang dilihat langsung terlihat sebagai lompatan.

| # | Kandidat | Menyebabkan lompat turun? | Alasan |
|---|---|---|---|
| 1 | `CalculationBalanceCard` — kotak Difference (`{diff != null && ...}`) | **YA — penyebab utama** | Wallet yang belum pernah di-reality-check: `last_reality_check = null` → `diff = null` → kotak tidak dirender. Ketikan PERTAMA di grid memanggil `onLiveTotal` → `liveWalletTotal` jadi angka → kotak (~90px) muncul DI ATAS grid → input yang sedang fokus terdorong ke bawah. Sama juga untuk `RealityCheckForm` (non-wallet). |
| 2 | `CalculationBalanceCard` — footer "Updated …" (`{account.last_reality_check_at && ...}`) | **YA, kecil (~20px)** | Save pertama → `updateRealityCheckAction` + invalidate `accountKeys.detail` → refetch → footer muncul DI ATAS grid. |
| 3 | Success card di `WalletDenominations` (`mutation.isSuccess && ...`) | **YA, saat save kedua dst.** | Kartu ada di paling bawah. Saat user tap Update lagi, `mutation.isPending` → `isSuccess` jadi false → kartu unmount → dokumen memendek. Kalau user sedang di dasar halaman, browser meng-clamp `scrollTop` → seluruh konten terlihat turun. Kartu yang muncul pertama kali (tambah tinggi di bawah) TIDAK menggeser apa pun. |
| 4 | Skeleton 9 sel vs grid 11 sel | Tidak saat input/save | TanStack Query v5 (`^5.101.2`): `isLoading = isPending && isFetching` → false saat refetch yang sudah punya data, jadi skeleton TIDAK muncul lagi setelah invalidate. Mismatch hanya saat load awal dan perubahannya di BAWAH. Tetap diperbaiki karena murah (pindah halaman lebih stabil). |
| 5 | Invalidate `dashboardKeys.all` / `accountKeys.list()` | Tidak | Query itu tidak dirender di halaman ini. |

Strategi: tinggi stabil secara struktural. Tidak pakai `scrollIntoView`/`overflow-anchor`.

---

## Task 1 — `CalculationBalanceCard`: slot Difference + footer selalu ada

**File:** `src/app/(app)/accounts/[id]/_components/CalculationBalanceCard.tsx`

### 1a. Kotak Difference — selalu dirender, `invisible` kalau `diff == null`

**Before:**
```tsx
        {/* Difference box */}
        {diff != null && (
          <div className="border-t border-gray-300 pt-4">
          <div className={`rounded-xl border px-4 py-3 text-center ${diffColorClass(diff)}`}>
            <p className="text-lg font-bold">
              {hideBalances
                ? MASK
                : diff === 0
                  ? "✓"
                  : formatCurrency(diff, "signs")}
            </p>
            <p className="text-xs mt-0.5 opacity-80">{diffLabel(diff)}</p>
          </div>
          </div>
        )}
```

**After:**
```tsx
        {/* Difference box — always rendered (invisible when empty) so typing the first value doesn't push the form down */}
        <div
          className={`border-t border-gray-300 pt-4 ${diff == null ? "invisible" : ""}`}
          aria-hidden={diff == null}
        >
          <div className={`rounded-xl border px-4 py-3 text-center ${diffColorClass(diff ?? 0)}`}>
            <p className="text-lg font-bold">
              {diff == null || hideBalances
                ? MASK
                : diff === 0
                  ? "✓"
                  : formatCurrency(diff, "signs")}
            </p>
            <p className="text-xs mt-0.5 opacity-80">{diffLabel(diff ?? 0)}</p>
          </div>
        </div>
```

Catatan: `invisible` = `visibility: hidden` → ruang tetap dipakai, tidak terlihat, tidak bisa di-tap. Isi dummy (`MASK` + label "Perfect Match!") hanya untuk menjaga tinggi 1 baris; label lain juga 1 baris di lebar 375px.

### 1b. Footer "Updated …" — baris selalu ada

**Before:**
```tsx
        {/* Footer: last updated */}
        {account.last_reality_check_at && (
          <div className="text-right mt-1">
            <span className="text-xs text-gray-400">
              Updated {formatLastUpdated(account.last_reality_check_at)}
            </span>
          </div>
        )}
```

**After:**
```tsx
        {/* Footer: last updated — fixed-height row so the first save doesn't shift content below */}
        <div className="text-right mt-1 h-4">
          {account.last_reality_check_at && (
            <span className="text-xs text-gray-400">
              Updated {formatLastUpdated(account.last_reality_check_at)}
            </span>
          )}
        </div>
```
(`text-xs` line-height = 1rem = `h-4`.) String "Updated" tetap literal seperti sebelumnya — di luar scope issue ini.

---

## Task 2 — `WalletDenominations`: skeleton setinggi layout asli + success card tidak unmount saat re-save

**File:** `src/app/(app)/accounts/[id]/_components/WalletDenominations.tsx`

### 2a. Skeleton = 11 sel dengan struktur & tinggi sama + tombol

Tinggi asli per sel: badge `text-sm py-1` = 28px (`h-7`), `gap-1.5`, input `text-base py-2 border` = 42px. Tombol `py-4 text-base` = 56px (`h-14`). Card asli pakai `p-4` (skeleton lama `p-5`).

**Before (baris 102-112):**
```tsx
  if (query.isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-20" />
          ))}
        </div>
      </div>
    );
  }
```

**After:**
```tsx
  if (query.isLoading) {
    // Skeleton mirrors the real layout (11 cells + button) so the swap doesn't change page height
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-3">
            {ALL_DENOMINATIONS.map(({ denomination, note_type }) => (
              <div key={denomKey(note_type, denomination)} className="flex flex-col items-center gap-1.5">
                <div className="animate-pulse bg-gray-100 rounded-lg h-7 w-full" />
                <div className="animate-pulse bg-gray-100 rounded-xl h-[42px] w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="animate-pulse bg-gray-200 rounded-2xl h-14" />
      </div>
    );
  }
```

### 2b. Success card tampil dari state `savedTotal`, bukan `mutation.isSuccess`

Sehingga saat save ulang (pending) kartu lama tetap ada lalu angkanya diganti di tempat — dokumen tidak memendek.

**Before (baris 151-152):**
```tsx
      {/* Success card — shown after save */}
      {mutation.isSuccess && savedTotal !== null && savedDiff !== null && (
```

**After:**
```tsx
      {/* Success card — stays mounted during re-save (keyed on saved snapshot, not mutation status) so page height doesn't shrink */}
      {!mutation.isError && savedTotal !== null && savedDiff !== null && (
```

Isi kartu dan error card TIDAK diubah. (String "Menyimpan...", "Updated Successfully!", "Gagal menyimpan" belum lewat `t()` — di luar scope, jangan disentuh di issue ini.)

---

## Yang sengaja TIDAK dilakukan

- `overflow-anchor` / `scrollIntoView`: iOS Safari tidak mendukung scroll anchoring; perbaikan struktural di atas sudah menutup semua sumber pergeseran di atas grid.
- `placeholderData: keepPreviousData` di `useWalletDenominations`: tidak perlu — key query tidak berubah, v5 tidak menampilkan `isLoading` saat refetch.
- Skeleton halaman di `page.tsx` (h-40 + h-48): perubahan di bawah, hanya saat load awal, tidak terkait input.
- Keyboard mobile yang menutup saat tap "Update Wallet": perilaku native, di luar kendali.

## Verifikasi

Tidak bisa di-unit-test (layout/scroll). Build wajib lolos (dijalankan user): `npm run build`.

Manual — Chrome DevTools device mode iPhone SE (375×667) DAN, kalau bisa, PWA di HP asli (iOS):

1. **Wallet belum pernah di-check** (atau set `last_reality_check`/`last_reality_check_at` = NULL untuk akun wallet uji). Buka `/accounts/<id-wallet>`. Scroll sampai baris koin (1.000 coin / 500) ada di tengah layar. Tap input 500, ketik `3`. **Harapan:** input tidak bergerak; kotak Difference muncul di tempat yang tadinya kosong di kartu atas.
2. Tap **Update Wallet** (save pertama). **Harapan:** grid tidak bergeser; teks "Updated just now" muncul di baris footer yang sudah ada; success card muncul di bawah tombol.
3. Scroll ke dasar halaman (success card terlihat). Ubah satu angka, tap **Update Wallet** lagi. **Harapan:** success card tetap terlihat selama "Menyimpan...", lalu angkanya berganti di tempat; halaman tidak melompat.
4. Reload halaman (throttle network "Slow 4G"). **Harapan:** skeleton 11 sel + tombol, tinggi sama dengan grid asli — tidak ada lompatan saat data masuk.
5. Akun **non-wallet** belum pernah di-check: ketik di RealityCheckForm. **Harapan:** form tidak terdorong turun (efek samping positif Task 1a).
6. Dengan privacy mask ON dan OFF, pastikan kotak Difference yang terisi tampil sama seperti sebelum perubahan.

## File yang disentuh

- `src/app/(app)/accounts/[id]/_components/CalculationBalanceCard.tsx`
- `src/app/(app)/accounts/[id]/_components/WalletDenominations.tsx`

Tidak perlu update AGENTS.md/README/roadmap (bugfix tanpa pattern baru).
