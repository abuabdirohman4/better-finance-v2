"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, DollarSign, Eye, EyeOff } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountCard } from "./_components/AccountCard";
import { AccountBottomSheet } from "./_components/AccountBottomSheet";
import { useAccounts } from "./_hooks/useAccounts";
import { getAccountTypesAction } from "./actions";
import { formatCurrency } from "@/lib/helper";
import { usePrivacyStore } from "@/stores/privacyStore";
import { accountKeys, dashboardKeys } from "@/lib/query";
import { Fab } from "@/components/layouts/Fab";
import { useTranslations } from "next-intl";

const MASK = "Rp •••.•••";

export default function AccountsPage() {
  const { data: accounts, isLoading, isError } = useAccounts();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggle = usePrivacyStore((s) => s.toggleHideBalances);
  const t = useTranslations("accounts");
  const tc = useTranslations("common");

  // ── Create sheet state (edit moved to [id]/page.tsx) ─────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

  // ── Account types for the create form ───────────────────────────────────────
  const { data: accountTypes } = useQuery({
    queryKey: ["account-types"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await getAccountTypesAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  // ── Cache invalidation on create success ────────────────────────────────────
  const queryClient = useQueryClient();
  const handleCreateSuccess = (assetCategory?: "liquid" | "investment") => {
    setCreateOpen(false);
    queryClient.invalidateQueries({ queryKey: accountKeys.list() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    // Non-liquid accounts live on /net-worth, so send the user there after creating one.
    if (assetCategory && assetCategory !== "liquid") router.push("/net-worth");
  };

  // /accounts shows liquid accounts only; non-liquid (investment) lives on /net-worth.
  const liquidAccounts = accounts?.filter((a) => a.asset_category === "liquid") ?? [];
  // Liabilities shown in grid but excluded from total (they reduce net worth, shown on /net-worth)
  const total = liquidAccounts
    .filter((a) => a.include_in_net_worth && !a.is_liability)
    .reduce((sum, a) => sum + a.current_balance, 0);
  const count = liquidAccounts.length;

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen">
      {/* Header gradient */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-6 pb-4">
        {/* Wave shape bawah */}
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(249 250 251)" />
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <Link
              href="/"
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
              aria-label={tc("back")}
            >
              <ChevronLeft className="w-7 h-7 text-white" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
              <p className="text-blue-100 text-sm">{t("subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-8 mt-6 space-y-6">
        {/* Total Balance card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">{t("totalBalance")}</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggle}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400"
                aria-label={tc("toggleBalance")}
              >
                {hideBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <div className="w-10 h-10 bg-linear-to-r from-green-400 to-green-500 rounded-full flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="animate-pulse bg-gray-200 h-10 w-48 rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 mb-1">
                {hideBalances ? MASK : formatCurrency(total)}
              </p>
              <p className="text-sm text-gray-500">{t("acrossCount", { count })}</p>
            </>
          )}
        </div>

        {/* Accounts grid — tap navigates to /accounts/[id] */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-32 shadow-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-sm text-red-600">{t("loadFailed")}</p>
          </div>
        ) : count > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {liquidAccounts.map((a) => (
              <Link href={`/accounts/${a.id}`} key={a.id}>
                <AccountCard account={a} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t("empty")}</p>
          </div>
        )}
      </div>

      {/* FAB — tambah akun */}
      <Fab onClick={() => setCreateOpen(true)} label={t("addAccount")} />

      {/* Create bottom sheet */}
      {createOpen && (
        <AccountBottomSheet
          mode="create"
          accountTypes={accountTypes ?? []}
          onClose={() => setCreateOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}
