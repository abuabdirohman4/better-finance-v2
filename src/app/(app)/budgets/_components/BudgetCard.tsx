"use client";

import { formatCurrency } from "@/lib/helper";
import type { BudgetWithSpending } from "@/db/queries/budgets";

interface Props {
  budget: BudgetWithSpending;
  onTap: (budget: BudgetWithSpending) => void;
  hideBalances: boolean;
  isEarning?: boolean;
}

export function getBudgetColors(percent: number, isEarning?: boolean) {
  if (isEarning) {
    if (percent >= 100) return { bar: "bg-green-500", text: "text-green-600", badge: "bg-green-100 text-green-700" };
    if (percent >= 80) return { bar: "bg-green-400", text: "text-green-500", badge: "bg-green-100 text-green-700" };
    return { bar: "bg-green-300", text: "text-green-500", badge: "bg-green-100 text-green-700" };
  }
  if (percent > 100) return { bar: "bg-red-500", text: "text-red-600", badge: "bg-red-100 text-red-700" };
  if (percent >= 80) return { bar: "bg-amber-400", text: "text-amber-600", badge: "bg-amber-100 text-amber-700" };
  return { bar: "bg-green-500", text: "text-green-600", badge: "bg-green-100 text-green-700" };
}

const ITEM_ICONS: Record<string, string> = {
  "Dining Out": "🍽️",
  "Food": "🍕",
  "Fruits": "🍎",
  "Grab Credit": "🚗",
};

const MASK = "Rp •••";

export function BudgetCard({ budget, onTap, hideBalances, isEarning }: Props) {
  const colors = getBudgetColors(budget.percent, isEarning);
  const barWidth = Math.min(budget.percent, 100);
  const remaining = budget.budgeted_amount - budget.actual_spending;

  return (
    <button
      onClick={() => onTap(budget)}
      className="w-full text-left bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 hover:border-blue-100 active:scale-[0.98] transition-all shrink-0"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-xl shrink-0">
             {ITEM_ICONS[budget.category_name] || "📦"}
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-800 block mb-0.5">{budget.category_name}</span>
            <span className="text-[11px] text-gray-500 block">
              {hideBalances ? MASK : `${formatCurrency(budget.actual_spending)} / ${formatCurrency(budget.budgeted_amount)}`}
            </span>
          </div>
        </div>
        <div className="text-right">
           <span className="font-bold text-sm text-gray-900 block">
             {hideBalances ? MASK : formatCurrency(remaining)}
           </span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mt-1">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${colors.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className={`text-[11px] font-bold ${colors.text} min-w-[32px] text-right`}>{budget.percent.toFixed(0)}%</span>
      </div>
    </button>
  );
}
