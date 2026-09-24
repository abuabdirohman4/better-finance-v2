"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createTransactionAction, updateTransactionAction, deleteTransactionAction } from "../actions";
import { TransactionForm } from "./TransactionForm";
import { transactionKeys, accountKeys, dashboardKeys, goalKeys, budgetKeys, debtKeys } from "@/lib/query";
import { useTranslations } from "next-intl";
import type { AccountRow, CategoryRow } from "@/db/queries/accounts";
import type { TransactionRow } from "@/db/queries/transactions";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/schemas/transaction";

interface TransactionBottomSheetProps {
  open: boolean;
  onClose: () => void;
  accounts: AccountRow[];
  categories: CategoryRow[];
  editTx?: TransactionRow | null;  // if set → edit mode
}

export function TransactionBottomSheet({
  open,
  onClose,
  accounts,
  categories,
  editTx,
}: TransactionBottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();

  const isEdit = Boolean(editTx);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setError(null);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  function invalidateCaches() {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: accountKeys.all });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: goalKeys.all });
    queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    queryClient.invalidateQueries({ queryKey: debtKeys.all });
  }

  function handleSubmit(input: CreateTransactionInput | UpdateTransactionInput) {
    setError(null);
    startTransition(async () => {
      const res = isEdit && editTx
        ? await updateTransactionAction(editTx.id, input as UpdateTransactionInput)
        : await createTransactionAction(input as CreateTransactionInput);

      if (!res.success) {
        setError(res.message ?? "Gagal menyimpan transaksi.");
        return;
      }
      invalidateCaches();
      handleClose();
    });
  }

  function handleDelete() {
    if (!editTx) return;
    startDeleteTransition(async () => {
      const res = await deleteTransactionAction(editTx.id);
      if (!res.success) {
        setError(res.message ?? "Gagal menghapus transaksi.");
        return;
      }
      invalidateCaches();
      handleClose();
    });
  }

  if (!open && !visible) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 cursor-pointer transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
        aria-label={tc("close")}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 max-h-[90vh] overflow-y-auto"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? "Edit Transaksi" : "Tambah Transaksi"}
            </h2>
            <div className="flex items-center gap-2">
              {isEdit && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting || isPending}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40"
                  aria-label={t("deleteTransaction")}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label={tc("close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {isDeleting && (
            <p className="text-sm text-red-600 mb-3">{t("deleting")}</p>
          )}

          <TransactionForm
            accounts={accounts}
            categories={categories}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error}
            initialValues={editTx ? {
              transaction_type: editTx.transaction_type as "spending" | "earning" | "transfer",
              transaction_date: editTx.transaction_date,
              account_id: editTx.account_id,
              to_account_id: editTx.to_account_id,
              goal_id: editTx.goal_id,
              debt_id: editTx.debt_id,
              category_id: editTx.category_id,
              amount: editTx.amount,
              note: editTx.note,
            } : undefined}
          />
        </div>
      </div>
    </>
  );
}
