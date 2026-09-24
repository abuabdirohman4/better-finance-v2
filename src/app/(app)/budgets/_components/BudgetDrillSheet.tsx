"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Pencil } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getBudgetTransactionsAction } from "../actions";
import { formatCurrency } from "@/lib/helper";
import { budgetKeys } from "@/lib/query";
import type { BudgetWithSpending, TransferBudgetRow } from "@/db/queries/budgets";

interface Props {
  open: boolean;
  onClose: () => void;
  budget: BudgetWithSpending | TransferBudgetRow | null;
  year: number;
  month: number;
  onEdit: (budget: BudgetWithSpending | TransferBudgetRow) => void;
  hideBalances: boolean;
}

const MASK = "Rp •••";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function BudgetDrillSheet({ open, onClose, budget, year, month, onEdit, hideBalances }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const isTransfer = budget && "type" in budget;
  const label = isTransfer ? budget.label : budget?.category_name;
  const actualSpending = isTransfer ? budget.actual_amount : budget?.actual_spending;
  
  const txQuery = useQuery({
    queryKey: [...budgetKeys.all, "drill", budget?.category_id, year, month, isTransfer ? (budget as TransferBudgetRow).type : "budget"],
    queryFn: async () => {
      if (!budget) return [];
      let type: "spending" | "earning" | "saving" | "investing" = "spending";
      if (isTransfer) {
        type = (budget as TransferBudgetRow).type;
      } else {
        const b = budget as BudgetWithSpending;
        if (b.group_name === "earning") type = "earning";
        else if (b.group_name === "saving") type = "saving";
        else if (b.group_name === "investing") type = "investing";
      }
      const res = await getBudgetTransactionsAction(budget.category_id, year, month, type);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    enabled: open && !!budget,
    staleTime: 30_000,
  });

  if (!open && !visible) return null;
  if (!budget) return null;

  const remaining = budget.budgeted_amount - (actualSpending ?? 0);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 max-h-[85vh] flex flex-col"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">{label}</h2>
            <div className="flex items-center gap-2">
              {!isTransfer && (
                <button
                  onClick={() => onEdit(budget)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Budget
                </button>
              )}
              <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>{hideBalances ? MASK : `${formatCurrency(actualSpending ?? 0)} spent`}</span>
            <span>{hideBalances ? MASK : `${formatCurrency(remaining > 0 ? remaining : 0)} left`}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${budget.percent > 100 ? "bg-red-500" : budget.percent >= 80 ? "bg-amber-400" : "bg-green-500"}`}
              style={{ width: `${Math.min(budget.percent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{MONTHS[month - 1]} {year}</p>
        </div>

        {/* Transaction list */}
        <div className="overflow-y-auto flex-1 pb-6">
          {txQuery.isLoading && (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />)}
            </div>
          )}
          {!txQuery.isLoading && (txQuery.data ?? []).length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              No transactions this month.
            </div>
          )}
          {!txQuery.isLoading && (txQuery.data ?? []).map(tx => (
            <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{tx.note || "—"}</p>
                <p className="text-[11px] text-gray-400">{tx.transaction_date} · {tx.account_name}</p>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {hideBalances ? MASK : formatCurrency(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
