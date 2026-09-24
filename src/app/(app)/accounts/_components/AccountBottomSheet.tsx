"use client";

import { useState, useTransition, useEffect } from "react";
import { X } from "lucide-react";
import {
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
} from "../actions";
import type { AccountRow } from "@/db/queries/accounts";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { useTranslations } from "next-intl";

interface AccountBottomSheetProps {
  mode: "create" | "edit";
  account?: AccountRow;
  accountTypes: { id: string; name: string; slug: string }[];
  onClose: () => void;
  onSuccess: (assetCategory?: "liquid" | "investment") => void;
}

export function AccountBottomSheet({
  mode,
  account,
  accountTypes,
  onClose,
  onSuccess,
}: AccountBottomSheetProps) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState(account?.name ?? "");
  // Edit: resolve current type id from slug (unique per user); AccountRow has no account_type_id.
  const originalTypeId = account
    ? (accountTypes.find((type) => type.slug === account.account_type_slug)?.id ?? "")
    : "";
  const [accountTypeId, setAccountTypeId] = useState(
    account ? originalTypeId : (accountTypes[0]?.id ?? "")
  );
  const [balance, setBalance] = useState(
    account ? String(account.current_balance) : "0"
  );
  const [assetCategory, setAssetCategory] = useState<"liquid" | "investment">(
    (account?.asset_category as "liquid" | "investment") ?? "liquid"
  );
  const [investmentGroup, setInvestmentGroup] = useState(
    account?.investment_group ?? ""
  );
  const [includeInNetWorth, setIncludeInNetWorth] = useState(
    account?.include_in_net_worth ?? true
  );
  const [isWallet, setIsWallet] = useState(account?.is_wallet ?? false);
  const [isLiability, setIsLiability] = useState(account?.is_liability ?? false);
  const [sortOrder, setSortOrder] = useState(
    account ? String(account.sort_order) : ""
  );
  const [error, setError] = useState<string | null>(null);

  // ── Delete confirm state ────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Transitions ─────────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  // ── Visible state for animation ─────────────────────────────────────────────
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Sync accountTypeId saat accountTypes pertama kali load (race condition: sheet buka sebelum query selesai)
  useEffect(() => {
    if (accountTypes.length === 0 || accountTypeId) return;
    setAccountTypeId(mode === "create" ? accountTypes[0].id : originalTypeId);
  }, [accountTypes, mode, accountTypeId, originalTypeId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedBalance = parseFloat(balance) || 0;
    const parsedOrder = sortOrder ? parseInt(sortOrder, 10) : undefined;

    startTransition(async () => {
      if (mode === "create") {
        if (!accountTypeId) {
          setError(t("selectTypeFirst"));
          return;
        }
        const res = await createAccountAction({
          name: name.trim(),
          account_type_id: accountTypeId,
          current_balance: parsedBalance,
          asset_category: assetCategory,
          investment_group: assetCategory === "investment" ? investmentGroup.trim() || null : null,
          include_in_net_worth: includeInNetWorth,
          is_wallet: isWallet,
          is_liability: assetCategory === "liquid" ? isLiability : false,
          sort_order: parsedOrder ?? 999,
        });
        if (!res.success) {
          setError(res.message ?? t("saveFailed"));
          return;
        }
      } else {
        const res = await updateAccountAction(account!.id, {
          name: name.trim() !== account!.name ? name.trim() : undefined,
          account_type_id:
            accountTypeId && accountTypeId !== originalTypeId ? accountTypeId : undefined,
          current_balance: parsedBalance !== account!.current_balance ? parsedBalance : undefined,
          asset_category:
            assetCategory !== account!.asset_category ? assetCategory : undefined,
          investment_group:
            (investmentGroup.trim() || null) !== (account!.investment_group ?? null)
              ? investmentGroup.trim() || null
              : undefined,
          include_in_net_worth:
            includeInNetWorth !== account!.include_in_net_worth ? includeInNetWorth : undefined,
          is_wallet: isWallet !== account!.is_wallet ? isWallet : undefined,
          is_liability: isLiability !== account!.is_liability ? isLiability : undefined,
          sort_order:
            parsedOrder !== undefined && parsedOrder !== account!.sort_order
              ? parsedOrder
              : undefined,
        });
        if (!res.success) {
          setError(res.message ?? t("updateFailed"));
          return;
        }
      }
      onSuccess(mode === "create" ? assetCategory : undefined);
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  function handleDelete() {
    startDelete(async () => {
      const res = await deleteAccountAction(account!.id);
      if (!res.success) {
        setError(res.message ?? t("deleteFailed"));
        return;
      }
      onSuccess();
    });
  }

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
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 p-6 transition-transform duration-300 shadow-2xl"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {mode === "create" ? t("addAccount") : t("editAccount")}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={tc("close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nama */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("nameLabel")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              placeholder={t("namePlaceholder")}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Account type — create + edit (bf-7m3: cosmetic label, nothing depends on it) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("accountType")} <span className="text-red-500">*</span>
            </label>
            <SingleSelect
              value={accountTypeId}
              onChange={setAccountTypeId}
              searchable={false}
              options={accountTypes.map((type) => ({ value: type.id, label: type.name }))}
              placeholder={accountTypes.length === 0 ? t("noTypes") : t("selectType")}
            />
          </div>

          {/* Kategori Aset */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("assetCategoryLabel")}
            </label>
            <SingleSelect
              value={assetCategory}
              onChange={(v) => {
                setAssetCategory(v as "liquid" | "investment");
                if (v !== "liquid") setIsLiability(false);
              }}
              searchable={false}
              options={[
                { value: "liquid", label: t("assetCategoryLiquidOption") },
                { value: "investment", label: t("assetCategoryInvestmentOption") },
              ]}
            />
          </div>

          {/* Investment group — kosong = otomatis dari prefix nama ("Emas : Antam 1g" → Emas) */}
          {assetCategory === "investment" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("investmentGroupLabel")}
              </label>
              <input
                type="text"
                value={investmentGroup}
                onChange={(e) => setInvestmentGroup(e.target.value)}
                maxLength={40}
                placeholder={t("investmentGroupPlaceholder")}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Saldo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === "create" ? t("initialBalanceLabel") : t("balanceLabel")}
            </label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              min={isLiability ? undefined : 0}
              placeholder="0"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isLiability && <p className="text-xs text-gray-500 mt-1">{t("liabilityBalanceHint")}</p>}
          </div>

          {/* Include in net worth */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="include-net-worth"
              checked={includeInNetWorth}
              onChange={(e) => setIncludeInNetWorth(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded"
            />
            <label htmlFor="include-net-worth" className="text-sm text-gray-700">
              {t("includeInNetWorthLabel")}
            </label>
          </div>

          {/* Urutan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("sortOrderLabel")}
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              min={1}
              placeholder={t("autoPlaceholder")}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-linear-to-r from-blue-500 to-indigo-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-opacity"
          >
            {isPending ? tc("saving") : tc("save")}
          </button>
        </form>

        {/* Delete — hanya mode edit */}
        {mode === "edit" && (
          <div className="mt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full text-red-600 font-medium py-2.5 rounded-xl border border-red-200 hover:bg-red-50 transition-colors text-sm"
              >
                {t("deleteAccount")}
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-700 font-medium flex-1">{tc("confirmDelete")}</p>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {isDeleting ? tc("processing") : tc("delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
