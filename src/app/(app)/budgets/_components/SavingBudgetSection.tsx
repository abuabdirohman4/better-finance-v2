"use client";

import { useState } from "react";
import { Wallet, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/helper";
import { useTranslations } from "next-intl";
import type { SavingBudgetRow } from "@/db/queries/goals";
import { GoalLedger } from "@/app/(app)/goals/_components/GoalLedger";
import { buildSavingBuckets } from "../_lib/savingBuckets";
import { getBudgetColors } from "./BudgetCard";

interface Props {
  rows: SavingBudgetRow[];
  year: number;
  month: number;
  hideBalances: boolean;
}

const MASK = "Rp •••";

export function SavingBudgetSection({ rows, year, month, hideBalances }: Props) {
  const t = useTranslations("budgets");
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const buckets = buildSavingBuckets(rows);
  if (buckets.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-900 text-lg">{t("budgetSaving")}</h2>
      {buckets.map((b) => {
        const colors = getBudgetColors(b.percent, true); // higher = better, like income
        return (
          <div key={b.type} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
            <div className="flex items-center p-3 gap-3">
              <div className="w-11 h-11 rounded-xl bg-green-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                {b.type === "saving" ? <Wallet className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">
                  {t(b.type === "saving" ? "bucketSaving" : "bucketInvesting")}
                </h3>
                <p className="text-[13px] text-gray-500">
                  {hideBalances ? MASK : `${formatCurrency(b.actual, "short")} / ${formatCurrency(b.target, "short")}`}
                </p>
              </div>
              <span className={`text-xs font-bold ${colors.text}`}>{b.percent.toFixed(0)}%</span>
            </div>
            <div className="px-3 pb-4">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colors.bar}`}
                  style={{ width: `${Math.min(b.percent, 100)}%` }}
                />
              </div>
            </div>
            <div className="space-y-2 px-1 pb-1">
              {b.items.map((g) => {
                const c = getBudgetColors(g.percent, true);
                const open = openGoalId === g.goal_id;
                return (
                  <div key={g.goal_id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setOpenGoalId(open ? null : g.goal_id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{g.goal_name}</span>
                        <span className="text-[11px] text-gray-500">
                          {hideBalances ? MASK : `${formatCurrency(g.actual_saved)} / ${formatCurrency(g.monthly_target)}`}
                        </span>
                      </div>
                      {g.monthly_target > 0 ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${c.bar}`}
                              style={{ width: `${Math.min(g.percent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold ${c.text} min-w-[32px] text-right`}>
                            {g.percent.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400">{t("noMonthlyTarget")}</p>
                      )}
                    </button>
                    {open && <GoalLedger goalId={g.goal_id} year={year} month={month} hideBalances={hideBalances} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
