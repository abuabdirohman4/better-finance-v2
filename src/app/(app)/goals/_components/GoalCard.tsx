"use client";

import { Target, TrendingUp, Calendar as CalendarIcon, Edit2 } from "lucide-react";
import { formatCurrency } from "@/lib/helper";
import type { GoalRow } from "@/db/queries/goals";
import { useState } from "react";
import { GoalLedger } from "./GoalLedger";
import { useTranslations, useLocale } from "next-intl";

function getGoalColors(percent: number) {
  if (percent >= 100) return { bar: "bg-green-500", badge: "bg-green-100 text-green-700", iconBg: "bg-green-100 text-green-600" };
  if (percent >= 80)  return { bar: "bg-blue-500",  badge: "bg-blue-100 text-blue-700", iconBg: "bg-blue-100 text-blue-600" };
  if (percent >= 50)  return { bar: "bg-amber-400", badge: "bg-amber-100 text-amber-700", iconBg: "bg-amber-100 text-amber-600" };
  return { bar: "bg-red-500", badge: "bg-red-100 text-red-700", iconBg: "bg-red-100 text-red-600" };
}

interface Props {
  goal: GoalRow;
  onEdit: (goal: GoalRow) => void;
  hideBalances: boolean;
}

export function GoalCard({ goal, onEdit, hideBalances }: Props) {
  const t = useTranslations("goals");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const colors = getGoalColors(goal.percent);
  const MASK = "Rp •••";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 transition-transform">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${colors.iconBg}`}>
            {goal.goal_type === "Saving" ? <Target className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">{goal.name}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${colors.badge}`}>
            {goal.percent.toFixed(0)}%
          </span>
          <button onClick={() => onEdit(goal)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end mb-2 mt-4">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{t("collected")}</p>
          <p className={`font-bold ${goal.collected_amount < 0 ? "text-red-600" : "text-gray-900"}`}>
            {hideBalances ? MASK : formatCurrency(goal.collected_amount)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5">{t("targetShort")}</p>
          <p className="font-bold text-gray-900">
            {hideBalances ? MASK : formatCurrency(goal.target_amount)}
          </p>
        </div>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${colors.bar}`}
          style={{ width: `${Math.min(goal.percent, 100)}%` }}
        />
      </div>

      {goal.collected_amount < 0 && (
        <p className="text-xs text-red-600 font-medium mb-2">
          {t("overspent", { amount: hideBalances ? MASK : formatCurrency(-goal.collected_amount) })}
        </p>
      )}

      {goal.deadline_date && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 mb-2">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{t("deadline_prefix")}: {new Date(goal.deadline_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      )}

      <button onClick={() => setExpanded(!expanded)} className="w-full text-xs text-gray-400 pt-2 pb-1 text-center hover:text-gray-600 transition-colors">
        {expanded ? `${t("hideHistory")} ▲` : `${t("showHistory")} ▾`}
      </button>
      {expanded && <GoalLedger goalId={goal.id} hideBalances={hideBalances} />}
    </div>
  );
}
