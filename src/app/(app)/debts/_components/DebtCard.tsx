"use client";

import { Calendar as CalendarIcon, Edit2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/helper";
import type { DebtRow } from "@/db/queries/debts";
import type { DebtMovementKind } from "@/lib/debt";

const MASK = "Rp •••";

const STATUS_BADGE: Record<DebtRow["status"], string> = {
  open: "bg-gray-100 text-gray-600",
  overdue: "bg-red-100 text-red-700",
  settled: "bg-green-100 text-green-700",
};

interface Props {
  debt: DebtRow;
  hideBalances: boolean;
  onEdit: (debt: DebtRow) => void;
  onMove: (debt: DebtRow, kind: DebtMovementKind) => void;
}

export function DebtCard({ debt, hideBalances, onEdit, onMove }: Props) {
  const t = useTranslations("debts");
  const locale = useLocale();
  const isReceivable = debt.direction === "receivable";
  const percentPaid = debt.total > 0 ? Math.min(100, (debt.settled / debt.total) * 100) : 0;
  const statusLabel = { open: t("statusOpen"), overdue: t("statusOverdue"), settled: t("statusSettled") }[debt.status];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 text-base truncate">{debt.counterparty}</h3>
          <p className="text-xs text-gray-500">{t("ledgerVia", { account: debt.account_name })}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${STATUS_BADGE[debt.status]}`}>{statusLabel}</span>
          <button
            onClick={() => onEdit(debt)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            aria-label={t("editDebt")}
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end mt-3 mb-2">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{t("outstanding")}</p>
          <p className={`font-bold text-lg ${isReceivable ? "text-emerald-600" : "text-red-600"}`}>
            {hideBalances ? MASK : formatCurrency(debt.outstanding)}
          </p>
        </div>
        <p className="text-xs text-gray-500">
          {t("ofTotal", { amount: hideBalances ? MASK : formatCurrency(debt.total) })}
        </p>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${percentPaid}%` }} />
      </div>

      {debt.due_date && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>
            {t("due", {
              date: new Date(debt.due_date).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
            })}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        {debt.status !== "settled" && (
          <button
            onClick={() => onMove(debt, "settle")}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {isReceivable ? t("collect") : t("repay")}
          </button>
        )}
        <button
          onClick={() => onMove(debt, "increase")}
          className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {isReceivable ? t("lendMore") : t("borrowMore")}
        </button>
      </div>
    </div>
  );
}
