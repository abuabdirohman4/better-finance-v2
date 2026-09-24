"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/helper";
import type { CategoryRow } from "@/db/queries/accounts";
import type { BudgetWithSpending } from "@/db/queries/budgets";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UpsertBudgetInput } from "@/lib/schemas/budget";
import type { ServerActionResult } from "@/lib/errorUtils";
import { CATEGORY_GROUP_LABELS } from "@/lib/constants";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  editBudget?: BudgetWithSpending | null;
  year: number;
  month: number;
  onSuccess: () => void;
  upsertMutation: UseMutationResult<ServerActionResult<{ id: string }>, Error, UpsertBudgetInput, unknown>;
  deleteMutation: UseMutationResult<ServerActionResult<void>, Error, string, unknown>;
}

export function BudgetBottomSheet({
  open,
  onClose,
  categories,
  editBudget,
  year,
  month,
  onSuccess,
  upsertMutation,
  deleteMutation,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [rawAmount, setRawAmount] = useState("");
  const [displayAmount, setDisplayAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("budgets");

  const isEdit = Boolean(editBudget);

  useEffect(() => {
    if (open) {
      if (editBudget) {
        setCategoryId(editBudget.category_id);
        const amtStr = String(editBudget.budgeted_amount);
        setRawAmount(amtStr);
        setDisplayAmount(formatCurrency(editBudget.budgeted_amount));
        setNote(editBudget.note || "");
      } else {
        setCategoryId("");
        setRawAmount("");
        setDisplayAmount("");
        setNote("");
      }
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open, editBudget]);

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

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    const num = parseInt(raw || "0", 10);
    setRawAmount(raw);
    setDisplayAmount(raw ? formatCurrency(num) : "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (!categoryId) {
      setError("Select a budget category.");
      return;
    }
    const numAmount = Number(rawAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Budget amount must be valid and greater than 0.");
      return;
    }

    upsertMutation.mutate(
      {
        category_id: categoryId,
        budget_year: year,
        budget_month: month,
        budgeted_amount: numAmount,
        note: note || null,
      },
      {
        onSuccess: (res) => {
          if (!res.success) {
            setError(res.message ?? t("genericError"));
            return;
          }
          onSuccess();
          handleClose();
        },
      }
    );
  }

  function handleDelete() {
    if (!editBudget) return;
    setError(null);
    deleteMutation.mutate(editBudget.id, {
      onSuccess: (res) => {
        if (!res.success) {
          setError(res.message ?? t("genericError"));
          return;
        }
        onSuccess();
        handleClose();
      },
    });
  }

  const groupOrder = Object.keys(CATEGORY_GROUP_LABELS);
  
  const categoryOptions = categories
    .filter((c) => c.group_name !== "saving" && c.group_name !== "investing")
    .map((c) => ({
      value: c.id,
      label: c.name,
      group: c.group_name || "Others",
      _order: groupOrder.indexOf(c.group_name) !== -1 ? groupOrder.indexOf(c.group_name) : 999,
    }))
    .sort((a, b) => a._order - b._order);

  if (!open && !visible) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 cursor-pointer transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 max-h-[90vh] overflow-y-auto"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? "Edit Budget" : "Add Budget"}
            </h2>
            <div className="flex items-center gap-2">
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending || upsertMutation.isPending}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <SingleSelect
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={t("selectCategory")}
                searchable
                direction="up"
                disabled={upsertMutation.isPending}
              />
            </div>

            <Input
              label={t("amountLabel")}
              type="text"
              inputMode="numeric"
              value={displayAmount}
              onChange={handleAmountChange}
              placeholder="0"
              disabled={upsertMutation.isPending}
              required
            />

            <Input
              label={t("noteLabel")}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              disabled={upsertMutation.isPending}
            />

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={upsertMutation.isPending || deleteMutation.isPending}
            >
              {upsertMutation.isPending ? "Saving..." : "Save Budget"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
