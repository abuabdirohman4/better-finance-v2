"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Eye, EyeOff, Pencil } from "lucide-react";
import { useAssets, useUpdateAccountValue } from "../_hooks/useAssets";
import { formatCurrency, formatDate } from "@/lib/helper";
import { usePrivacyStore } from "@/stores/privacyStore";
import { productLabel } from "@/lib/investment";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { AssetRow } from "@/db/queries/assets";

const MASK = "Rp •••.•••";

export default function InvestmentGroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group: rawGroup } = use(params); // React 19: params is a Promise
  const groupKey = decodeURIComponent(rawGroup);

  const { data, isLoading, isError } = useAssets();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggle = usePrivacyStore((s) => s.toggleHideBalances);
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const te = useTranslations("error");

  const group = data?.investmentGroups.find((g) => g.key === groupKey);
  const money = (n: number) => (hideBalances ? MASK : formatCurrency(n));

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen pb-24">
      {/* Header gradient */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-6 py-7">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(249 250 251)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/net-worth"
              className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
            >
              <ChevronLeft className="w-7 h-7" />
            </Link>
            <h1 className="text-xl font-bold text-white">{group?.label ?? "Investment"}</h1>
          </div>
          <button
            onClick={toggle}
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
            aria-label={tc("toggleBalance")}
          >
            {hideBalances ? (
              <EyeOff className="w-5 h-5 text-white" />
            ) : (
              <Eye className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 mt-6 space-y-6">
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="animate-pulse bg-gray-200 h-10 w-48 rounded mx-auto" />
          </div>
        ) : isError ? (
          <p className="text-red-500 text-sm px-1">{te("loadData")}</p>
        ) : !group ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
            <p className="text-gray-500 text-sm">{t("groupNotFound")}</p>
            <Link href="/net-worth" className="text-blue-600 text-sm font-semibold mt-2 inline-block">
              Back to Net Worth
            </Link>
          </div>
        ) : (
          <>
            {/* Group summary: invested (modal) · market value · P&L */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Total Invested
                </p>
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                  {money(group.total)}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {group.items.length} {group.items.length === 1 ? "product" : "products"}
                  {group.valuedCount > 0 && ` · ${group.valuedCount} valued`}
                </p>
              </div>
              {group.valuedCount > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Market Value
                    </p>
                    <p className="font-bold text-gray-900 mt-0.5">{money(group.totalValue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      P&amp;L
                    </p>
                    <p className={`font-bold mt-0.5 ${pnlColor(group.pnl)}`}>
                      {hideBalances ? MASK : formatPnl(group.pnl, investedOfValued(group.items))}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-products — tap row to set market value */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {group.items.map((item) => (
                <ProductRow key={item.id} item={item} hideBalances={hideBalances} />
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center px-4">
              Tap a product to set its current market value. Net Worth stays based on invested amount.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Σ modal produk yang sudah dinilai — basis persen P&L grup. */
function investedOfValued(items: AssetRow[]): number {
  return items.reduce((s, a) => (a.current_value == null ? s : s + a.current_balance), 0);
}

function pnlColor(pnl: number | null): string {
  if (pnl == null || pnl === 0) return "text-gray-500";
  return pnl > 0 ? "text-emerald-600" : "text-red-500";
}

/** "+Rp 2.047.000 (+204,7%)" — basis = modal; persen disembunyikan kalau modal 0. */
function formatPnl(pnl: number, basis: number): string {
  const sign = pnl > 0 ? "+" : pnl < 0 ? "-" : "";
  const abs = formatCurrency(Math.abs(pnl));
  if (basis <= 0) return `${sign}${abs}`;
  const pct = ((pnl / basis) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return `${sign}${abs} (${sign}${pct}%)`;
}

// ── row + inline editor ──────────────────────────────────────────────────────

function ProductRow({ item, hideBalances }: { item: AssetRow; hideBalances: boolean }) {
  const [editing, setEditing] = useState(false);
  const t = useTranslations("assets");
  const label = productLabel(item.name);
  const initials = label.substring(0, 2).toUpperCase();
  const money = (n: number) => (hideBalances ? MASK : formatCurrency(n));

  return (
    <div>
      <button
        type="button"
        onClick={() => setEditing((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-[11px] font-bold text-white">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{label}</p>
          <p className="text-[11px] text-gray-400">
            {t("invested")} {money(item.current_balance)}
            {item.last_valued_at && ` · ${t("updated")} ${formatDate(new Date(item.last_valued_at))}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {item.current_value == null ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              <Pencil className="w-3 h-3" /> {t("setValue")}
            </span>
          ) : (
            <>
              <p className="font-bold text-gray-900 text-sm">{money(item.current_value)}</p>
              <p className={`text-[11px] font-semibold ${pnlColor(item.pnl)}`}>
                {hideBalances ? MASK : formatPnl(item.pnl ?? 0, item.current_balance)}
              </p>
            </>
          )}
        </div>
      </button>
      {editing && <ValueEditor item={item} onDone={() => setEditing(false)} />}
    </div>
  );
}

function ValueEditor({ item, onDone }: { item: AssetRow; onDone: () => void }) {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const [raw, setRaw] = useState(item.current_value == null ? "" : String(Math.round(item.current_value)));
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateAccountValue();

  const display = raw ? formatCurrency(parseInt(raw, 10)) : "";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Digit-only, tampil ter-format (pola sama TransactionForm)
    setRaw(e.target.value.replace(/\D/g, ""));
  }

  function save(value: number | null) {
    setError(null);
    mutation.mutate(
      { accountId: item.id, value },
      { onSuccess: onDone, onError: (e) => setError(e.message) }
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!raw) return setError(t("enterMarketValue"));
        save(parseInt(raw, 10));
      }}
      className="px-4 pb-4 pt-1 bg-gray-50/70 space-y-3"
    >
      <Input
        label={t("marketValue")}
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={tc("amountPlaceholder")}
        autoFocus
        error={error ?? undefined}
        className="font-semibold"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending ? tc("saving") : tc("save")}
        </Button>
        {item.current_value != null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => save(null)}
          >
            {tc("clear")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
