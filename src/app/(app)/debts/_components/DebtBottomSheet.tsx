"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/helper";
import { ledgerDirection } from "@/lib/debt";
import type { AccountRow } from "@/db/queries/accounts";
import type { DebtRow } from "@/db/queries/debts";
import type { DebtDirection } from "@/lib/constants";
import type { CreateDebtInput, UpdateDebtInput } from "@/lib/schemas/debt";

interface Props {
  open: boolean;
  onClose: () => void;
  debt: DebtRow | null; // null = create
  defaultDirection: DebtDirection;
  accounts: AccountRow[];
  onCreate: (input: CreateDebtInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateDebtInput) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DebtBottomSheet({ open, onClose, debt, defaultDirection, accounts, onCreate, onUpdate, onArchive }: Props) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");

  const [direction, setDirection] = useState<DebtDirection>(defaultDirection);
  const [counterparty, setCounterparty] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [movesNow, setMovesNow] = useState(true);
  const [cashId, setCashId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ledgerOptions = accounts
    .filter((a) => ledgerDirection(a.is_liability) === direction)
    .map((a) => ({ value: a.id, label: a.name }));
  const cashOptions = accounts
    .filter((a) => a.asset_category === "liquid" && !a.is_liability)
    .map((a) => ({ value: a.id, label: a.name }));

  const defaultLedger = (dir: DebtDirection) =>
    accounts.find((a) => a.slug === (dir === "receivable" ? "ar" : "ap") && ledgerDirection(a.is_liability) === dir)?.id ?? "";

  useEffect(() => {
    if (!open) return;
    const dir = debt?.direction ?? defaultDirection;
    setDirection(dir);
    setCounterparty(debt?.counterparty ?? "");
    setAmountRaw(debt ? String(debt.opening_amount) : "");
    setLedgerId(debt?.account_id ?? defaultLedger(dir));
    setMovesNow(true);
    setCashId(cashOptions[0]?.value ?? "");
    setDate(todayStr());
    setDueDate(debt?.due_date ?? "");
    setNote(debt?.note ?? "");
    setErrorMsg("");
    setIsSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt]);

  function changeDirection(dir: DebtDirection) {
    setDirection(dir);
    setLedgerId(defaultLedger(dir));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const amount = Number(amountRaw || "0");
    if (!counterparty.trim()) return setErrorMsg(t("counterpartyRequired"));
    if (!debt && amount <= 0) return setErrorMsg(t("amountRequired"));
    if (!debt && !ledgerId) return setErrorMsg(t("accountRequired"));
    if (!debt && movesNow && !cashId) return setErrorMsg(t("accountRequired"));

    setIsSubmitting(true);
    try {
      if (debt) {
        await onUpdate(debt.id, {
          counterparty: counterparty.trim(),
          opening_amount: amount,
          due_date: dueDate || null,
          note: note.trim() || null,
        });
      } else {
        await onCreate({
          direction,
          counterparty: counterparty.trim(),
          account_id: ledgerId,
          amount,
          due_date: dueDate || null,
          note: note.trim() || null,
          cash_account_id: movesNow ? cashId : null,
          transaction_date: date,
        });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmArchive() {
    if (!debt) return;
    setIsSubmitting(true);
    try {
      await onArchive(debt.id);
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("saveFailed"));
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 cursor-pointer transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 ease-out"
        style={{ transform: open ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        <div className="flex justify-center pt-3 pb-2 cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="px-6 pb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{debt ? t("editDebt") : t("newDebt")}</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-500" aria-label={tc("close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 pb-8 scrollbar-hide">
          {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">{errorMsg}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!debt && (
              <div className="flex gap-2">
                {(["receivable", "payable"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => changeDirection(dir)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                      direction === dir
                        ? dir === "receivable" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {t(dir)}
                  </button>
                ))}
              </div>
            )}

            <Input
              label={t("counterparty")}
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={t("counterpartyPlaceholder")}
              maxLength={100}
            />

            <div className="space-y-1">
              <Input
                label={debt ? t("openingAmount") : t("amount")}
                value={amountRaw ? formatCurrency(Number(amountRaw)) : ""}
                onChange={(e) => setAmountRaw(e.target.value.replace(/\D/g, ""))}
                placeholder={tc("amountPlaceholder")}
                inputMode="numeric"
              />
              {debt && <p className="text-xs text-gray-500">{t("openingAmountHint")}</p>}
            </div>

            {!debt && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t("ledgerAccount")}</label>
                {ledgerOptions.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
                    {t("noLedger")}{" "}
                    <Link href="/accounts" className="underline font-medium">{t("goToAccounts")}</Link>
                  </p>
                ) : (
                  <SingleSelect
                    options={ledgerOptions}
                    value={ledgerId}
                    onChange={setLedgerId}
                    placeholder={t("selectAccount")}
                    searchable
                    direction="down"
                  />
                )}
              </div>
            )}

            {!debt && (
              <div className="space-y-3 rounded-xl bg-gray-50 p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={movesNow}
                    onChange={(e) => setMovesNow(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  {t("moneyMovesNow")}
                </label>
                <p className="text-xs text-gray-500">{movesNow ? t("moneyMovesNowHint") : t("alreadyInLedgerHint")}</p>
                {movesNow && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-gray-700">{t("cashAccount")}</label>
                      <SingleSelect
                        options={cashOptions}
                        value={cashId}
                        onChange={setCashId}
                        placeholder={t("selectAccount")}
                        searchable
                        direction="up"
                      />
                    </div>
                    <Input type="date" label={t("date")} value={date} onChange={(e) => setDate(e.target.value)} />
                  </>
                )}
              </div>
            )}

            <Input type="date" label={t("dueDate")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

            <Input
              label={t("note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />

            <div className="pt-4 flex gap-3">
              {debt && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isSubmitting}
                  className="px-4 text-gray-600"
                  aria-label={t("archive")}
                >
                  <Archive className="w-5 h-5" />
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? tc("saving") : tc("save")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("confirmArchiveTitle")}
        message={t("confirmArchiveMessage")}
        confirmLabel={t("archive")}
        loading={isSubmitting}
        onConfirm={confirmArchive}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
