"use client";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/helper";
import { getGoalLedgerAction } from "../actions";
import { useTranslations } from "next-intl";
import { goalKeys } from "@/lib/query";

interface Props {
  goalId: string;
  hideBalances: boolean;
  year?: number;  // with month: only that month (budget page)
  month?: number;
}

export function GoalLedger({ goalId, hideBalances, year, month }: Props) {
  const t = useTranslations("common");
  const { data = [], isLoading } = useQuery({
    queryKey: [...goalKeys.detail(goalId), "ledger", year ?? null, month ?? null],
    queryFn: async () => {
      const res = await getGoalLedgerAction(goalId, year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  if (isLoading) return <div className="h-20 animate-pulse bg-gray-100 rounded-xl" />;
  if (data.length === 0) return (
    <p className="text-xs text-gray-400 py-3 text-center">{t("noHistory")}</p>
  );

  return (
    <div className="divide-y divide-gray-50 mt-3 pt-3 border-t border-gray-100">
      {data.map(row => (
        <div key={row.id} className="flex items-center justify-between py-2.5 px-1">
          <div>
            <p className="text-xs font-medium text-gray-800">{row.note ?? row.category_name ?? "-"}</p>
            <p className="text-[10px] text-gray-400">{row.transaction_date}</p>
          </div>
          <span className={`text-sm font-bold ${row.transaction_type === "transfer" ? "text-green-600" : "text-red-500"}`}>
            {row.transaction_type === "transfer" ? "+" : "-"}
            {hideBalances ? "•••" : formatCurrency(row.amount, "short")}
          </span>
        </div>
      ))}
    </div>
  );
}
