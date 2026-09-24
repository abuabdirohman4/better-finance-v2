"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { formatCurrency } from "@/lib/helper";
import { useTranslations } from "next-intl";
import type { WishlistRow } from "@/db/queries/wishlist";

interface Props {
  open: boolean;
  onClose: () => void;
  item: WishlistRow | null; // null = create mode
  onSave: (data: {
    name: string;
    description?: string | null;
    url?: string | null;
    estimated_price: number;
    priority: number;
    target_date?: string | null;
    status?: "active" | "purchased" | "cancelled";
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
}

const PRIORITY_OPTIONS = [
  { value: "1", label: "1 — Urgent" },
  { value: "2", label: "2 — High" },
  { value: "3", label: "3 — Normal" },
  { value: "4", label: "4 — Low" },
  { value: "5", label: "5 — Someday" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "purchased", label: "Purchased" },
  { value: "cancelled", label: "Cancelled" },
];

export function WishlistBottomSheet({ open, onClose, item, onSave, onDelete, isPending, error }: Props) {
  const t = useTranslations("wishlist");
  const tc = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [priceRaw, setPriceRaw] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("");
  const [priority, setPriority] = useState("3");
  const [url, setUrl] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [localError, setLocalError] = useState("");

  const isEdit = Boolean(item);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setPriceRaw(item ? String(item.estimated_price) : "");
      setPriceDisplay(item ? formatCurrency(item.estimated_price) : "");
      setPriority(item ? String(item.priority) : "3");
      setUrl(item?.url ?? "");
      setTargetDate(item?.target_date ?? "");
      setDescription(item?.description ?? "");
      setStatus(item?.status ?? "active");
      setLocalError("");
      requestAnimationFrame(() => setVisible(true));
    }
  }, [open, item]);

  const handleClose = useCallback(() => {
    setVisible(false);
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

  const handlePriceChange = (val: string) => {
    const numStr = val.replace(/\D/g, "");
    setPriceRaw(numStr);
    setPriceDisplay(numStr ? formatCurrency(Number(numStr)) : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (!name.trim()) return setLocalError("Item name is required");
    if (!priceRaw || Number(priceRaw) <= 0) return setLocalError("Price must be greater than 0");

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        estimated_price: Number(priceRaw),
        priority: Number(priority),
        target_date: targetDate || null,
        ...(isEdit ? { status: status as "active" | "purchased" | "cancelled" } : {}),
      });
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setLocalError(message);
    }
  };

  const handleDelete = async () => {
    if (!item || !onDelete || !window.confirm("Delete this item?")) return;
    try {
      await onDelete(item.id);
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      setLocalError(message);
    }
  };

  if (!open && !visible) return null;

  const displayError = error || localError;

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
              {isEdit ? "Edit Wishlist" : "Add Wishlist"}
            </h2>
            <div className="flex items-center gap-2">
              {isEdit && onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40"
                  aria-label={t("deleteItem")}
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

          {displayError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t("itemName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("itemNamePlaceholder")}
            />

            <Input
              label={t("estimatedPrice")}
              value={priceDisplay}
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder={tc("amountPlaceholder")}
              inputMode="numeric"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("priority")}</label>
              <SingleSelect
                options={PRIORITY_OPTIONS}
                value={priority}
                onChange={setPriority}
                placeholder={t("selectPriority")}
                direction="down"
              />
            </div>

            <Input
              label={t("urlLabel")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://tokopedia.link/..."
            />

            <Input
              label={t("targetDate")}
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />

            <Input
              label={t("notesLabel")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("notesPlaceholder")}
            />

            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("status")}</label>
                <SingleSelect
                  options={STATUS_OPTIONS}
                  value={status}
                  onChange={setStatus}
                  placeholder={t("selectStatus")}
                  direction="up"
                />
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
