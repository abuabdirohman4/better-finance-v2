"use client";

import { useState, useEffect } from "react";
import { useWalletDenominations } from "../_hooks/useWalletDenominations";
import { formatCurrency } from "@/lib/helper";

// Semua pecahan IDR dalam satu urutan — paper dulu, coin sesudah
// Ditampilkan sebagai unified grid tanpa pemisah section
const ALL_DENOMINATIONS: { denomination: number; note_type: "paper" | "coin" }[] = [
  { denomination: 100000, note_type: "paper" },
  { denomination: 50000,  note_type: "paper" },
  { denomination: 20000,  note_type: "paper" },
  { denomination: 10000,  note_type: "paper" },
  { denomination: 5000,   note_type: "paper" },
  { denomination: 2000,   note_type: "paper" },
  { denomination: 1000,   note_type: "paper" },
  { denomination: 1000,   note_type: "coin"  },
  { denomination: 500,    note_type: "coin"  },
  { denomination: 200,    note_type: "coin"  },
  { denomination: 100,    note_type: "coin"  },
];

interface Props {
  accountId: string;
  currentBalance: number;
  /** Dipanggil setiap total berubah (saat user mengetik) — untuk live preview di CalculationBalanceCard */
  onLiveTotal?: (total: number) => void;
  /** Dipanggil setelah save berhasil — untuk update last_reality_check */
  onSaveTotal?: (total: number) => void;
}

type DenomKey = string; // "paper-100000"

function denomKey(note_type: string, denom: number) {
  return `${note_type}-${denom}`;
}

/** Format denomination label: 100000 → "100.000", 500 → "500" */
function formatDenomLabel(denom: number): string {
  return new Intl.NumberFormat("id-ID").format(denom);
}

export function WalletDenominations({ accountId, currentBalance, onLiveTotal, onSaveTotal }: Props) {
  const { query, mutation } = useWalletDenominations(accountId);
  const [counts, setCounts] = useState<Record<DenomKey, number>>({});

  // State untuk success card — snapshot nilai saat save
  const [savedTotal, setSavedTotal] = useState<number | null>(null);
  const [savedDiff, setSavedDiff] = useState<number | null>(null);

  // Prefill dari DB saat data load
  useEffect(() => {
    if (!query.data) return;
    const map: Record<DenomKey, number> = {};
    for (const row of query.data) {
      map[denomKey(row.note_type, row.denomination)] = row.count;
    }
    setCounts(map);
  }, [query.data]);

  const getCount = (note_type: string, denom: number) =>
    counts[denomKey(note_type, denom)] ?? 0;

  const setCount = (note_type: string, denom: number, value: string) => {
    const n = parseInt(value.replace(/\D/g, "")) || 0;
    const next = { ...counts, [denomKey(note_type, denom)]: n };
    setCounts(next);

    // Hitung total baru langsung dari next state untuk menghindari stale closure
    const nextTotal = ALL_DENOMINATIONS.reduce(
      (sum, { denomination, note_type: nt }) =>
        sum + (next[denomKey(nt, denomination)] ?? 0) * denomination,
      0
    );
    onLiveTotal?.(nextTotal);
  };

  // Live total dari state (untuk render summary)
  const total = ALL_DENOMINATIONS.reduce(
    (sum, { denomination, note_type }) =>
      sum + getCount(note_type, denomination) * denomination,
    0
  );

  function handleSave() {
    const rows = ALL_DENOMINATIONS.map(({ denomination, note_type }) => ({
      denomination,
      note_type,
      count: getCount(note_type, denomination),
    }));
    // Snapshot sebelum async — total tidak berubah saat mutation berjalan
    const savedTotalSnapshot = total;
    mutation.mutate(rows, {
      onSuccess: () => {
        setSavedTotal(savedTotalSnapshot);
        setSavedDiff(savedTotalSnapshot - currentBalance);
        onSaveTotal?.(savedTotalSnapshot);
      },
    });
  }

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

  return (
    <div className="space-y-3">
      {/* Denomination grid — clean card, no title, no summary, no section labels */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-3 gap-3">
          {ALL_DENOMINATIONS.map(({ denomination, note_type }) => (
            <div
              key={denomKey(note_type, denomination)}
              className="flex flex-col items-center gap-1.5"
            >
              {/* Green badge label */}
              <span className="text-sm font-semibold text-green-700 bg-green-100 rounded-lg px-3 py-1 w-full text-center">
                {formatDenomLabel(denomination)}
              </span>
              {/* Count input */}
              <input
                type="tel"
                inputMode="numeric"
                value={getCount(note_type, denomination) === 0 ? "" : getCount(note_type, denomination)}
                onChange={(e) => setCount(note_type, denomination, e.target.value)}
                placeholder="0"
                className="w-full text-center text-base font-medium border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Update button — full width below the card */}
      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        className="w-full bg-linear-to-r from-blue-500 to-indigo-600 text-white font-semibold py-4 rounded-2xl disabled:opacity-50 transition-opacity text-base shadow-md"
      >
        {mutation.isPending ? "Menyimpan..." : "Update Wallet"}
      </button>

      {/* Success card — stays mounted during re-save (keyed on saved snapshot, not mutation status) so page height doesn't shrink */}
      {!mutation.isError && savedTotal !== null && savedDiff !== null && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 space-y-1.5">
          <p className="text-green-800 font-bold text-base flex items-center gap-2">
            <span>✅</span> Updated Successfully!
          </p>
          <p className="text-green-700 text-sm">
            Total calculated:{" "}
            <span className="font-semibold">{formatCurrency(savedTotal)}</span>
          </p>
          <p className="text-green-700 text-sm">
            Difference:{" "}
            <span className="font-semibold">
              {savedDiff === 0 ? "Rp 0" : formatCurrency(savedDiff, "signs")}
            </span>
          </p>
        </div>
      )}

      {/* Error state */}
      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3">
          <p className="text-red-600 text-sm text-center">
            {mutation.error instanceof Error ? mutation.error.message : "Gagal menyimpan"}
          </p>
        </div>
      )}
    </div>
  );
}
