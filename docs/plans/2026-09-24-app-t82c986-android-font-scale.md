# app-t82c986 — UI looks bigger on Samsung than Xiaomi (Android font scale)

**Tipe:** bugfix (CSS/meta only) · **Mode:** B (direct, 2 files, <20 lines) · **Executor:** Sonnet
**Jangan:** jalankan `build`/`test` sendiri — minta user. Jangan commit tanpa approval.

---

## 1. Diagnosis (sudah diverifikasi 24 Sep 2026)

| Fakta | Lokasi |
|---|---|
| Viewport cuma `width/initialScale/maximumScale:1/userScalable:false/themeColor` | `src/app/layout.tsx:25-31` |
| Tidak ada `html { font-size }`, tidak ada `text-size-adjust` | `src/app/globals.css` |
| `--max-width: 448px` didefinisikan tapi tidak dipakai di mana pun | `src/app/globals.css:3-5` |
| Batas lebar nyata = `max-w-md` (28rem = 448px **pada root 16px** — ikut membesar kalau root membesar) | `src/app/(app)/layout.tsx:6` |
| Semua `text-*`/`p-*`/`gap-*` Tailwind = rem → seluruh UI ikut skala root | seluruh `src/` |
| Ada ±30 ukuran px hardcode (`text-[11px]` x15, `text-[10px]`, `text-[9px]`, `w-[36px]`, …) → TIDAK ikut skala rem | `grep -rn "\-\[[0-9]*px\]" src` |

### Bagaimana Chrome Android memakai skala font OS (riset)

Ada **tiga** mekanisme berbeda; Samsung vs Xiaomi bisa beda karena salah satunya:

1. **Page zoom (Chrome ≥ M113-an, "Default zoom" di Settings > Accessibility).** Zoom default halaman
   *secara diam-diam* ikut setelan ukuran font OS → **semua** membesar (px juga, padding, gambar),
   `window.innerWidth` mengecil. Tidak ada opt-out CSS. Tidak berlaku di WebView.
2. **Text autosizing / font boosting (warisan "Text scaling").** Memperbesar teks saja. Dimatikan
   oleh `text-size-adjust: none|100%`.
3. **Samsung "Screen zoom" / ukuran tampilan (DPI).** Bukan font — mengubah lebar CSS viewport
   (mis. Samsung 360px vs Xiaomi 393px). Semua (rem & px) terlihat lebih besar. **Tidak bisa & tidak
   perlu diperbaiki di CSS** — itu pilihan user, sama seperti app native.

**Opt-in baru: `<meta name="text-scale" content="scale">` — shipping Chrome M146 (Android + desktop).**
Dengan meta ini Chrome **mematikan** page zoom otomatis & text autosizing, dan sebagai gantinya
menskala **font-size default root** (`medium`, 16px) sesuai skala font OS × setelan browser.
Artinya rem ikut skala OS, tapi sekarang CSS kita bisa **mengendalikannya** (clamp).
Browser tanpa dukungan (Chrome <146, Samsung Internet lama, Safari) mengabaikan meta → aman.

Sumber: [Intent to Ship text-scale](https://groups.google.com/a/chromium.org/g/blink-dev/c/0yp2ygJK5HE),
[PSA page zoom Android](https://groups.google.com/a/chromium.org/g/blink-dev/c/rTNCw0lHmZk),
[Adrian Roselli](http://adrianroselli.com/2026/02/honoring-mobile-os-text-size.html),
[Matuzović](https://matuzo.at/blog/2026/text-scaling-meta-tag),
[env(preferred-text-scale) explainer](https://davidsgrogan.github.io/env-explainer.html).

---

## 2. Keputusan

**Rekomendasi: opt-in `text-scale` + clamp root font 16–18px + `text-size-adjust: 100%`.**

- Samsung (font OS besar) & Xiaomi (default) jadi **hampir sama**: selisih maksimal 12,5%, bukan 30%+.
- User yang butuh teks besar tetap dapat sedikit pembesaran (sampai 18px) + masih bisa pinch-zoom
  (lihat Step 3). Tidak "membunuh" aksesibilitas total.
- Layout tidak meledak: `max-w-md` dan padding rem maksimal +12,5%.

| Opsi | Konsisten? | Aksesibilitas | Catatan |
|---|---|---|---|
| A. Biarkan | ❌ | ✅ penuh | status quo, keluhan tetap |
| B. `html { font-size: 16px }` fixed | ✅ di mekanisme 2 & (dgn meta) 1 | ❌ mati total | paling gampang, tapi user low-vision dirugikan |
| **C. meta text-scale + `clamp(16px, 100%, 18px)`** | ✅ (selisih ≤12,5%) | ⚠️ dibatasi, pinch-zoom tetap | **dipilih** |
| D. meta text-scale saja, tanpa clamp | ❌ (sengaja ikut OS) | ✅ penuh | benar secara a11y tapi justru kebalikan dari permintaan |

Trade-off C yang diterima: user dengan font OS sangat besar (≥130%) hanya dapat 112,5%.
Knob kalibrasi = angka `18px` di clamp (naikkan ke 20px kalau terasa terlalu ketat).

**Batas yang diketahui:** di Chrome <146 page zoom (mekanisme 1) tetap aktif dan tidak bisa
dimatikan dari CSS. Mekanisme 3 (Screen zoom Samsung) sengaja tidak disentuh.

---

## 3. Langkah eksekusi

### Step 0 — Diagnosa di device SEBELUM ubah kode (wajib, 2 menit)

Di **Samsung dan Xiaomi**, buka app di Chrome (bukan PWA dulu), sambungkan ke Chrome DevTools
(`chrome://inspect` di laptop, USB debugging on), lalu di Console:

```js
({ innerWidth, dpr: devicePixelRatio, rootFont: getComputedStyle(document.documentElement).fontSize,
   vvScale: visualViewport.scale, ua: navigator.userAgent.match(/Chrome\/\d+/)?.[0] })
```

Catat juga: Settings Android > Display > Font size & **Screen zoom**; Chrome > Settings > Accessibility.

Interpretasi:
- `innerWidth` beda jauh (mis. 360 vs 393) **dan** `rootFont` sama 16px → mekanisme 3 (Screen zoom)
  atau page zoom. Cek Screen zoom Samsung: kalau bukan default, itu penyebabnya → laporkan ke user,
  fix di Step 1–2 tidak akan menghapus selisih ini.
- `rootFont` 16px, `innerWidth` sama, tapi teks lebih besar → mekanisme 2 (autosizing) → Step 2 memperbaiki.
- Chrome ≥146 → Step 1 berlaku penuh.

Tempel hasilnya ke `bd notes app-t82c986`.

### Step 1 — Tambah meta `text-scale` di `src/app/layout.tsx`

Taruh sebagai `<head>` statis di root layout (bukan via `generateMetadata` — Next 16 bisa
men-stream metadata async ke body untuk UA non-bot, dan meta ini harus ada saat parse awal).

**Before** (`src/app/layout.tsx:36-38`):
```tsx
  return (
    <html lang={locale} className="h-full">
      <body className={inter.className + " min-h-full bg-slate-50"}>
```

**After:**
```tsx
  return (
    <html lang={locale} className="h-full">
      <head>
        {/* Chrome 146+: font OS → root font-size (bukan page zoom), dibatasi di globals.css */}
        <meta name="text-scale" content="scale" />
      </head>
      <body className={inter.className + " min-h-full bg-slate-50"}>
```

### Step 2 — Clamp root font + matikan autosizing di `src/app/globals.css`

**Before** (`src/app/globals.css:3-5`):
```css
:root {
  --max-width: 448px;
}
```

**After** (hapus `--max-width` yang tak terpakai — sudah dicek `grep -rn "max-width" src` hanya muncul di sini):
```css
/* Skala font OS ikut, tapi dibatasi 16–18px biar UI konsisten antar device (app-t82c986) */
html {
  font-size: clamp(16px, 100%, 18px);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
```

Catatan untuk executor:
- `100%` = font default dari browser (yang sudah diskala meta text-scale). Tanpa meta/di browser lama
  = 16px → hasil 16px, tak ada perubahan visual di Xiaomi default.
- Letakkan di luar `@layer` supaya tidak kalah oleh preflight Tailwind (preflight tidak set font-size
  html, tapi eksplisit lebih aman).
- Jangan sentuh `text-[11px]` dkk — di luar scope (lihat Pertanyaan terbuka #3).

### Step 3 — Viewport: izinkan pinch-zoom (`src/app/layout.tsx:25-31`)

**Before:**
```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f8fafc",
};
```

**After:**
```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fafc",
};
```

Alasan: karena teks sekarang di-clamp, pinch-zoom adalah jalan keluar a11y yang tersisa (WCAG 1.4.4;
Lighthouse menandai `user-scalable=no`). Hapus **keduanya** — di Chrome Android `maximumScale: 1`
sendiri juga mengunci pinch-zoom.

Risiko yang diketahui (sudah dicek): field `Input` pakai `text-sm` (14px,
`src/components/ui/Input.tsx:43`) → **Safari iOS** akan auto-zoom saat input difokus. Diterima: user app
ini Android (Chrome Android tidak auto-zoom saat fokus). Kalau nanti iOS jadi target, fix-nya ganti
input ke `text-base`, bukan mengunci zoom lagi.

### Step 4 — Dokumentasi

Tambah 1 bagian pendek di `AGENTS.md` (di bawah "Tailwind v4"):
```md
**Skala font Android (app-t82c986):** `<meta name="text-scale" content="scale">` di root layout +
`html { font-size: clamp(16px, 100%, 18px) }` di globals.css. Font OS user diikuti tapi dibatasi 18px.
Hindari ukuran `text-[Npx]` baru — pakai kelas rem supaya ikut skala.
```

---

## 4. Verifikasi

**User jalankan:** `npm run build` (wajib lolos) lalu deploy/`npm run dev` akses via LAN.

### Chrome DevTools (laptop)
1. DevTools > Elements > `<head>` → ada `<meta name="text-scale" content="scale">` (di head, bukan body).
2. Console: `getComputedStyle(document.documentElement).fontSize` → `"16px"`.
3. Chrome desktop Settings > Appearance > Font size "Very large" (Chrome 146+) → reload →
   nilai di atas `"18px"` (bukan 24px). Kembalikan ke Medium.
4. Device toolbar 360 / 393 / 412px → tidak ada horizontal scroll di `/`, `/transactions`, `/budgets`.

### Device nyata (Samsung + Xiaomi, Chrome, lalu PWA terpasang)
1. Jalankan snippet Step 0 lagi → catat `rootFont` & `innerWidth` sebelum/sesudah.
2. Font OS **default** di kedua HP → screenshot dashboard; ukuran teks saldo & BottomNav harus
   sama secara visual (kecuali beda Screen zoom — cek angka `innerWidth`).
3. Font OS **maksimum** di Samsung → `rootFont` ≤ `18px`, layout tidak pecah, BottomNav tak terpotong.
4. Pinch-zoom berfungsi (kalau Step 3 dijalankan).
5. PWA terpasang (standalone): ulangi poin 2–3 — PWA Chrome = mesin yang sama; kalau PWA dipasang
   lewat **Samsung Internet**, catat versinya (meta text-scale kemungkinan belum didukung di sana).

Lolos = bd notes berisi angka before/after dari kedua device, lalu `bd close app-t82c986`.

---

## 5. File yang disentuh

- `src/app/layout.tsx` (Step 1, Step 3)
- `src/app/globals.css` (Step 2)
- `AGENTS.md` (Step 4)

## 6. Pertanyaan terbuka (dengan rekomendasi)

1. **Batas atas clamp 18px atau 20px?** → 18px; cukup untuk bantu tanpa merusak layout 360px, knob-nya satu angka.
2. **Hapus `userScalable:false` + `maximumScale:1`?** → Ya; setelah clamp, pinch-zoom satu-satunya jalan keluar a11y, dan efek samping (iOS zoom saat fokus input 14px) tidak kena user Android.
3. **Ganti `text-[11px]`/`text-[10px]`/`text-[9px]` ke rem?** → Nanti, issue terpisah; mereka tidak ikut skala tapi bukan penyebab keluhan ini.
4. **Kalau Step 0 menunjukkan penyebabnya Samsung Screen zoom?** → Terima (tutup sebagai by-design); itu pilihan user, sama seperti app native.
