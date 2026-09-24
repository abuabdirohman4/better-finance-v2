"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/helper";
import type { AccountRow } from "@/db/queries/accounts";
import type { DebtRow } from "@/db/queries/debts";
import type { DebtMovementKind } from "@/lib/debt";
import type { DebtMovementInput } from "@/lib/schemas/debt";

interface Props {
  target: { debt: DebtRow; kind: DebtMovementKind } | null; // null = closed
  accounts: AccountRow[];
  onClose: () => void;
  onSubmit: (input: DebtMovementInput) => Promise<void>;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DebtMovementSheet({ target, accounts, onClose, onSubmit }: Props) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const open = target !== null;

  const cashOptions = accounts
    .filter((a) => a.asset_category === "liquid" && !a.is_liability)
    .map((a) => ({ value: a.id, label: a.name }));

  const [cashId, setCashId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!target) return;
    setCashId(cashOptions[0]?.value ?? "");
    // Settling defaults to the full outstanding amount.
    setAmountRaw(target.kind === "settle" && target.debt.outstanding > 0 ? String(Math.round(target.debt.outstanding)) : "");
    setDate(todayStr());
    setNote("");
    setErrorMsg("");
    setIsSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const isReceivable = target.debt.direction === "receivable";
  const title =
    target.kind === "settle"
      ? isReceivable ? t("collect") : t("repay")
      : isReceivable ? t("lendMore") : t("borrowMore");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const amount = Number(amountRaw || "0");
    if (amount <= 0) return setErrorMsg(t("amountRequired"));
    if (!cashId) return setErrorMsg(t("accountRequired"));
    setIsSubmitting(true);
    try {
      await onSubmit({
        debt_id: target!.debt.id,
        kind: target!.kind,
        cash_account_id: cashId,
        amount,
        transaction_date: date,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("saveFailed"));
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 cursor-pointer" onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl"
        style={{ transform: open ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{target.debt.counterparty}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-500" aria-label={tc("close")}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-4">
          {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">{errorMsg}</div>}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t("cashAccount")}</label>
            <SingleSelect
              options={cashOptions}
              value={cashId}
              onChange={setCashId}
              placeholder={t("selectAccount")}
              searchable
              direction="down"
            />
          </div>
          <Input
            label={t("amount")}
            value={amountRaw ? formatCurrency(Number(amountRaw)) : ""}
            onChange={(e) => setAmountRaw(e.target.value.replace(/\D/g, ""))}
            placeholder={tc("amountPlaceholder")}
            inputMode="numeric"
          />
          <Input type="date" label={t("date")} value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <Button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl">
            {isSubmitting ? tc("saving") : tc("save")}
          </Button>
        </form>
      </div>
    </>
  );
}
