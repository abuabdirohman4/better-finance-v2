"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDebts } from "./_hooks/useDebts";
import { DebtCard } from "./_components/DebtCard";
import { DebtBottomSheet } from "./_components/DebtBottomSheet";
import { DebtMovementSheet } from "./_components/DebtMovementSheet";
import { Fab } from "@/components/layouts/Fab";
import { usePrivacyStore } from "@/stores/privacyStore";
import { formatCurrency } from "@/lib/helper";
import { cn } from "@/lib/utils";
import type { DebtRow } from "@/db/queries/debts";
import type { DebtDirection } from "@/lib/constants";
import type { DebtMovementKind } from "@/lib/debt";

const MASK = "Rp •••";

// Overdue first, then nearest due date (no date last), then name.
function compareDebts(a: DebtRow, b: DebtRow): number {
  const rank = (d: DebtRow) => (d.status === "overdue" ? 0 : 1);
  return (
    rank(a) - rank(b) ||
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    a.counterparty.localeCompare(b.counterparty)
  );
}

export default function DebtsPage() {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const { query, accountsQuery, createMutation, updateMutation, archiveMutation, movementMutation } = useDebts();

  const [tab, setTab] = useState<DebtDirection>("receivable");
  const [showSettled, setShowSettled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editDebt, setEditDebt] = useState<DebtRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ debt: DebtRow; kind: DebtMovementKind } | null>(null);

  const accounts = accountsQuery.data ?? [];
  const inTab = (query.data?.debts ?? []).filter((d) => d.direction === tab);
  const active = inTab.filter((d) => d.status !== "settled").sort(compareDebts);
  const settled = inTab.filter((d) => d.status === "settled");
  const tabLedgers = (query.data?.ledgers ?? []).filter((l) => l.direction === tab);
  // Total = what the ledger accounts hold (= what Net Worth counts), split below into debts + untracked.
  const total = tabLedgers.reduce((s, l) => s + l.owed, 0);
  const untracked = tabLedgers.filter((l) => Math.abs(l.untracked) >= 1);

  function openCreate() {
    setEditDebt(null);
    setSheetOpen(true);
  }

  function openEdit(d: DebtRow) {
    setEditDebt(d);
    setSheetOpen(true);
  }

  return (
    <div className="bg-blue-50 min-h-screen">
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-5 pb-6">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(239 246 255)" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center">
          <Link href="/net-worth" className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label={tc("back")}>
            <ChevronLeft className="w-7 h-7 text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">{t("title")}</h1>
            <p className="text-blue-100 text-sm">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 pb-24 space-y-4">
        <div className="flex gap-2">
          {(["receivable", "payable"] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => setTab(dir)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                tab === dir ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200"
              )}
            >
              {t(dir)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
          <p className="text-sm text-gray-500 mb-1">{tab === "receivable" ? t("totalReceivable") : t("totalPayable")}</p>
          {query.isLoading ? (
            <div className="animate-pulse bg-gray-200 h-8 w-40 rounded mx-auto" />
          ) : (
            <p className={`text-3xl font-bold ${tab === "receivable" ? "text-emerald-600" : "text-red-600"}`}>
              {hideBalances ? MASK : formatCurrency(total)}
            </p>
          )}
        </div>

        {query.isError && <p className="text-sm text-red-600">{t("loadFailed")}</p>}

        {untracked.map((l) => (
          <div key={l.account_id} className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-4">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-gray-700 text-sm">{t("untracked", { account: l.name })}</p>
              <p className="font-bold text-gray-900">{hideBalances ? MASK : formatCurrency(l.untracked)}</p>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t("untrackedHint")}</p>
          </div>
        ))}

        {query.isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse h-32" />
            ))}
          </div>
        )}

        {!query.isLoading && active.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-6">
            {tab === "receivable" ? t("emptyReceivable") : t("emptyPayable")}
          </p>
        )}

        {active.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            hideBalances={hideBalances}
            onEdit={openEdit}
            onMove={(debt, kind) => setMoveTarget({ debt, kind })}
          />
        ))}

        {settled.length > 0 && (
          <>
            <button
              onClick={() => setShowSettled((v) => !v)}
              className="w-full text-sm text-gray-500 py-2 hover:text-gray-700"
            >
              {showSettled ? t("hideSettled") : t("showSettled", { count: settled.length })}
            </button>
            {showSettled &&
              settled.map((d) => (
                <DebtCard
                  key={d.id}
                  debt={d}
                  hideBalances={hideBalances}
                  onEdit={openEdit}
                  onMove={(debt, kind) => setMoveTarget({ debt, kind })}
                />
              ))}
          </>
        )}
      </div>

      <Fab onClick={openCreate} label={t("newDebt")} />

      <DebtBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        debt={editDebt}
        defaultDirection={tab}
        accounts={accounts}
        onCreate={async (input) => { await createMutation.mutateAsync(input); }}
        onUpdate={async (id, input) => { await updateMutation.mutateAsync({ id, input }); }}
        onArchive={async (id) => { await archiveMutation.mutateAsync(id); }}
      />

      <DebtMovementSheet
        target={moveTarget}
        accounts={accounts}
        onClose={() => setMoveTarget(null)}
        onSubmit={async (input) => { await movementMutation.mutateAsync(input); }}
      />
    </div>
  );
}
