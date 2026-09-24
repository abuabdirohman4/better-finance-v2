// Logo + skema warna per akun — diport dari v1 utils/constants.js (accountLogos + accountColorSchemes).
// Key = nama akun (case-sensitive, sama seperti v1). Fallback abu-abu untuk nama tak dikenal.

export interface AccountVisual {
  /** Teks inisial di logo (mis. "M", "BCA", "GP") — untuk akun non-wallet. */
  initials: string;
  /** true → render icon dompet (lucide Wallet), bukan inisial. */
  isWalletIcon: boolean;
  /** Warna teks inisial (Tailwind class). */
  iconColor: string;
  /** Warna bg lingkaran inisial (Tailwind class), null untuk wallet. */
  iconBg: string | null;
  /** Bar saldo bawah — warna aksen bg. */
  accent: string;
  /** Warna teks saldo di bar. */
  text: string;
}

interface LogoDef {
  initials: string;
  iconColor: string;
  iconBg: string | null;
  isWalletIcon?: boolean;
}

const LOGOS: Record<string, LogoDef> = {
  Wallet: { initials: "", iconColor: "text-gray-600", iconBg: null, isWalletIcon: true },
  Mandiri: { initials: "M", iconColor: "text-white", iconBg: "bg-red-600" },
  BCA: { initials: "B", iconColor: "text-white", iconBg: "bg-blue-600" },
  BNI: { initials: "B", iconColor: "text-white", iconBg: "bg-yellow-600" },
  "E-Toll": { initials: "ET", iconColor: "text-white", iconBg: "bg-orange-500" },
  Flip: { initials: "F", iconColor: "text-white", iconBg: "bg-purple-600" },
  GoPay: { initials: "GP", iconColor: "text-white", iconBg: "bg-teal-500" },
  Grab: { initials: "G", iconColor: "text-white", iconBg: "bg-green-600" },
  Jenius: { initials: "J", iconColor: "text-white", iconBg: "bg-indigo-600" },
  Ovo: { initials: "O", iconColor: "text-white", iconBg: "bg-purple-500" },
  AR: { initials: "AR", iconColor: "text-white", iconBg: "bg-emerald-600" },
  AP: { initials: "AP", iconColor: "text-white", iconBg: "bg-rose-600" },
};

const COLOR_SCHEMES: Record<string, { accent: string; text: string }> = {
  Wallet: { accent: "bg-gray-100", text: "text-gray-800" },
  Mandiri: { accent: "bg-red-100", text: "text-red-800" },
  BCA: { accent: "bg-blue-100", text: "text-blue-800" },
  BNI: { accent: "bg-yellow-100", text: "text-yellow-800" },
  "E-Toll": { accent: "bg-orange-100", text: "text-orange-800" },
  Flip: { accent: "bg-purple-100", text: "text-purple-800" },
  GoPay: { accent: "bg-teal-100", text: "text-teal-800" },
  Grab: { accent: "bg-green-100", text: "text-green-800" },
  Jenius: { accent: "bg-indigo-100", text: "text-indigo-800" },
  Ovo: { accent: "bg-purple-100", text: "text-purple-800" },
  AR: { accent: "bg-emerald-100", text: "text-emerald-800" },
  AP: { accent: "bg-rose-100", text: "text-rose-800" },
};

const FALLBACK_SCHEME = { accent: "bg-gray-100", text: "text-gray-800" };

export function getAccountVisual(name: string): AccountVisual {
  const logo = LOGOS[name];
  const scheme = COLOR_SCHEMES[name] ?? FALLBACK_SCHEME;

  if (logo) {
    return {
      initials: logo.initials,
      isWalletIcon: logo.isWalletIcon ?? false,
      iconColor: logo.iconColor,
      iconBg: logo.iconBg,
      accent: scheme.accent,
      text: scheme.text,
    };
  }

  // Fallback: inisial dari 1-2 huruf pertama nama, lingkaran abu-abu
  return {
    initials: name.slice(0, 2).toUpperCase(),
    isWalletIcon: false,
    iconColor: "text-white",
    iconBg: "bg-gray-500",
    accent: FALLBACK_SCHEME.accent,
    text: FALLBACK_SCHEME.text,
  };
}

/** Akun yang di-render pakai formatCurrency superscript (tipe Bank). */
export function isBankAccount(accountTypeSlug: string): boolean {
  return accountTypeSlug === "bank";
}
