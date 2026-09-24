"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, BarChart3, Calendar, Settings } from "lucide-react";
import { useBudgets } from "./_hooks/useBudgets";
import { BudgetGroup } from "./_components/BudgetGroup";
import { SavingBudgetSection } from "./_components/SavingBudgetSection";
import { BudgetBottomSheet } from "./_components/BudgetBottomSheet";
import { BudgetDrillSheet } from "./_components/BudgetDrillSheet";

import { Fab } from "@/components/layouts/Fab";
import { usePrivacyStore } from "@/stores/privacyStore";
import { formatCurrency } from "@/lib/helper";
import { useTranslations } from "next-intl";
import type { BudgetWithSpending } from "@/db/queries/budgets";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function BudgetsPage() {
  const t = useTranslations("budgets");
  const tc = useTranslations("common");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetWithSpending | null>(null);
  const hideBalances = usePrivacyStore((s) => s.hideBalances);

  const { query, incomeQuery, savingQuery, fundedQuery, categoriesQuery, upsertMutation, deleteMutation } = useBudgets(year, month);
  const fundedFromGoals = fundedQuery.data ?? 0;

  const budgets = query.data ?? [];
  const incomeBudgets = incomeQuery.data ?? [];
  const savingRows = savingQuery.data ?? [];

  // Group by group_name
  const groups = budgets.reduce<Record<string, BudgetWithSpending[]>>((acc, b) => {
    const g = b.group_name || "lainnya";
    if (!acc[g]) acc[g] = [];
    acc[g].push(b);
    return acc;
  }, {});

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.budgeted_amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.actual_spending), 0);
  const overallPercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
  const overallRemaining = totalBudgeted - totalSpent;

  function openCreate() { setEditBudget(null); setSheetOpen(true); }
  function openEdit(b: BudgetWithSpending) { setEditBudget(b); setSheetOpen(true); }

  const [drillBudget, setDrillBudget] = useState<BudgetWithSpending | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);

  function openDrill(b: BudgetWithSpending) {
    setDrillBudget(b);
    setDrillOpen(true);
  }

  function openEditFromDrill(b: BudgetWithSpending) {
    setDrillOpen(false);
    setTimeout(() => {
      setEditBudget(b);
      setSheetOpen(true);
    }, 320); // Wait for drill sheet to close
  }

  const MASK = "Rp •••";

  return (
    <div className="bg-blue-50 min-h-screen">
      {/* Header */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-5 pb-6">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(239 246 255)" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label={tc("back")}>
              <ChevronLeft className="w-7 h-7 text-white" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">{t("title")}</h1>
              <p className="text-blue-100 text-sm">{t("subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
              <div className="relative">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="appearance-none bg-white/20 text-white border border-white/30 rounded-xl px-3 py-2 pr-7 text-sm font-semibold focus:outline-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1} className="text-gray-900 bg-white">{m}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/80" />
            </div>
            <div className="relative">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="appearance-none bg-white/20 text-white border border-white/30 rounded-xl px-3 py-2 pr-7 text-sm font-semibold focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                  <option key={y} value={y} className="text-gray-900 bg-white">{y}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/80" />
            </div>
            </div>
          </div>

        {/* Segmented Control (Toggle) */}
        <div className="mt-5 mb-2 bg-white/20 p-1 rounded-xl flex items-center relative z-10">
          <div className="flex-1 text-center py-1.5 bg-white text-blue-700 font-semibold rounded-lg shadow-sm text-sm">
            Monthly
          </div>
          <Link href="/budgets/weekly" className="flex-1 text-center py-1.5 text-white/90 font-medium text-sm hover:text-white">
            Weekly
          </Link>
        </div>
      </div>

      <div className="px-4 mt-4 pb-24 space-y-6">
        {/* Overall Progress Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-5">
            <h2 className="font-semibold text-gray-800">{t("overallProgress")}</h2>
            <Link 
              href="/budgets/categories"
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Categories
            </Link>
          </div>

          <div className="flex justify-between mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{t("budget")}</p>
              <p className="font-semibold text-gray-900">{hideBalances ? MASK : formatCurrency(totalBudgeted, "short")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{t("spending")}</p>
              <p className="font-semibold text-gray-900">{hideBalances ? MASK : formatCurrency(totalSpent, "short")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{t("remaining")}</p>
              <p className="font-semibold text-gray-900">{hideBalances ? MASK : formatCurrency(overallRemaining, "short")}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(overallPercent, 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-green-600">{overallPercent.toFixed(0)}%</span>
          </div>
          {fundedFromGoals > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              {t("fundedFromGoals")}:{" "}
              <span className="font-semibold text-gray-700">
                {hideBalances ? MASK : formatCurrency(fundedFromGoals, "short")}
              </span>
            </p>
          )}
        </div>



        {/* Loading */}
        {query.isLoading && (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="animate-pulse bg-white rounded-2xl h-32 shadow-sm" />)}
          </div>
        )}

        {/* Empty state */}
        {!query.isLoading && budgets.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t("empty")}</p>
            <p className="text-gray-400 text-xs mt-1">{t("emptyHint")}</p>
          </div>
        )}

        {/* Income Budget Section */}
        {!query.isLoading && incomeBudgets.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">{t("budgetEarning")}</h2>
            </div>
            <BudgetGroup group="earning" items={incomeBudgets} hideBalances={hideBalances} onTap={openDrill} />
          </div>
        )}

        {/* Saving / Investing — targets from goals' monthly_contribution (bf-yz4) */}
        {!savingQuery.isLoading && (
          <SavingBudgetSection rows={savingRows} year={year} month={month} hideBalances={hideBalances} />
        )}

        {/* Budget Spending Title */}
        {!query.isLoading && (
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-lg">{t("budgetSpending")}</h2>
          </div>
        )}

        {/* Groups */}
        {Object.entries(groups).map(([group, items]) => (
          <BudgetGroup key={group} group={group} items={items} hideBalances={hideBalances} onTap={openDrill} />
        ))}


      </div>

      <Fab onClick={openCreate} label={t("addBudget")} />

      <BudgetBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        categories={categoriesQuery.data ?? []}
        editBudget={editBudget}
        year={year}
        month={month}
        onSuccess={() => setSheetOpen(false)}
        upsertMutation={upsertMutation}
        deleteMutation={deleteMutation}
      />

      <BudgetDrillSheet
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        budget={drillBudget}
        year={year}
        month={month}
        onEdit={openEditFromDrill}
        hideBalances={hideBalances}
      />
    </div>
  );
}
