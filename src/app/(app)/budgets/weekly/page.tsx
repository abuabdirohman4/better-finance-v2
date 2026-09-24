"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useWeeklyBudget } from "./_hooks/useWeeklyBudget";
import { WeeklyBudgetCard } from "./_components/WeeklyBudgetCard";
import { WeeklyOverallCard } from "./_components/WeeklyOverallCard";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTranslations } from "next-intl";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function WeeklyBudgetPage() {
  const t = useTranslations("budgets");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const hideBalances = usePrivacyStore((s) => s.hideBalances);

  const { budgetQuery, txQuery, weeklyData, selectedWeek, setSelectedWeek, weeksInMonth } =
    useWeeklyBudget(year, month);

  const isLoading = budgetQuery.isLoading || txQuery.isLoading;

  return (
    <div className="bg-blue-50 min-h-screen">
      {/* Header */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-5 pb-6">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(239 246 255)" />
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <div>
                <h1 className="text-2xl font-bold text-white leading-tight">{t("title")}</h1>
                <p className="text-blue-100 text-sm">{t("subtitle")}</p>
              </div>
            </div>
            {/* Month + Year selectors */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="appearance-none bg-white/20 text-white border border-white/30 rounded-xl px-3 py-1.5 pr-6 text-sm font-semibold focus:outline-none cursor-pointer"
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
                  className="appearance-none bg-white/20 text-white border border-white/30 rounded-xl px-3 py-1.5 pr-6 text-sm font-semibold focus:outline-none cursor-pointer"
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
          <div className="mt-5 mb-5 bg-white/20 p-1 rounded-xl flex items-center">
            <Link href="/budgets" className="flex-1 text-center py-1.5 text-white/90 font-medium text-sm hover:text-white">
              Monthly
            </Link>
            <div className="flex-1 text-center py-1.5 bg-white text-blue-700 font-semibold rounded-lg shadow-sm text-sm">
              Weekly
            </div>
          </div>

          {/* Week selector tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
            {Array.from({ length: weeksInMonth }, (_, i) => i + 1).map((w) => (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`shrink-0 px-5 py-1.5 rounded-full text-sm font-bold transition-all ${
                  selectedWeek === w
                    ? "bg-white text-blue-700 shadow-sm"
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                Week {w}
              </button>
            ))}
          </div>

          {/* Timeline Progress Bar */}
          {/* <div className="h-2 bg-white/20 rounded-full w-full overflow-hidden mt-1 mb-2">
            <div 
              className="h-full bg-white rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${(selectedWeek / weeksInMonth) * 100}%` }}
            />
          </div> */}
        </div>
      </div>

      <div className="px-4 mt-4 pb-24 space-y-3">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="animate-pulse bg-white rounded-2xl h-20 shadow-sm" />)}
          </div>
        )}

        {!isLoading && weeklyData.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t("weeklyEmpty")}</p>
            <p className="text-gray-400 text-xs mt-1">{t("weeklySetHint")} <Link href="/budgets" className="text-blue-500 underline">{t("title")}</Link> page first.</p>
          </div>
        )}

        {!isLoading && weeklyData.length > 0 && (
          <>
            <WeeklyOverallCard weeklyData={weeklyData} hideBalances={hideBalances} />
            <div className="space-y-2">
              {weeklyData.map((d) => (
                <WeeklyBudgetCard key={d.categoryName} data={d} hideBalances={hideBalances} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
