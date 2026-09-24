"use client";

import React, { use, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccountAction, updateRealityCheckAction, getAccountTypesAction } from "../actions";
import { CalculationBalanceCard } from "./_components/CalculationBalanceCard";
import { RealityCheckForm } from "./_components/RealityCheckForm";
import { WalletDenominations } from "./_components/WalletDenominations";
import { AccountBottomSheet } from "../_components/AccountBottomSheet";
import { accountKeys, dashboardKeys } from "@/lib/query";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTranslations } from "next-intl";

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params); // React 19: params is a Promise
  const t = useTranslations("accounts");

  // ── Form state ──────────────────────────────────────────────────────────────
  const [rawValue, setRawValue] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(null);
  const [successAmount, setSuccessAmount] = useState<number | null>(null);
  const [successDiff, setSuccessDiff] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  // ── Wallet live preview state — total pecahan sebelum disimpan ───────────────
  const [liveWalletTotal, setLiveWalletTotal] = useState<number | null>(null);

  // ── Edit sheet state ─────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);

  // ── Privacy ──────────────────────────────────────────────────────────────────
  const hideBalances = usePrivacyStore((s) => s.hideBalances);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();

  const { data: account, isLoading, isError } = useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: async () => {
      const res = await getAccountAction(id);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  const { data: accountTypes } = useQuery({
    queryKey: ["account-types"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await getAccountTypesAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  // ── Pre-fill input dari last_reality_check tersimpan ────────────────────────
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (account && !prefilled.current && account.last_reality_check != null) {
      const raw = String(account.last_reality_check);
      const numFull = Number(account.last_reality_check);
      const intPart = Math.floor(numFull);
      const decPart = Math.round((numFull - intPart) * 100);
      const display = decPart > 0
        ? `${new Intl.NumberFormat("id-ID").format(intPart)},${String(decPart).padStart(2, "0")}`
        : new Intl.NumberFormat("id-ID").format(numFull);
      setRawValue(raw);
      setDisplayValue(display);
      prefilled.current = true;
    }
  }, [account]);

  // ── Submit reality check ─────────────────────────────────────────────────────
  function handleSubmit() {
    if (!rawValue.trim()) {
      setLastResult("error");
      setErrorMsg(t("enterActualBalance"));
      return;
    }
    const num = parseFloat(rawValue);
    startTransition(async () => {
      const res = await updateRealityCheckAction(id, num);
      if (res.success) {
        setLastResult("success");
        setSuccessAmount(num);
        setSuccessDiff(account ? num - account.current_balance : null);
        // Pre-fill input dengan nilai baru — user tidak perlu ketik ulang
        const numInt = Math.floor(num);
        const dec = Math.round((num - numInt) * 100);
        const newDisplay = dec > 0
          ? `${new Intl.NumberFormat("id-ID").format(numInt)},${String(dec).padStart(2, "0")}`
          : new Intl.NumberFormat("id-ID").format(num);
        setRawValue(String(num));
        setDisplayValue(newDisplay);
        // Reset prefilled ref agar useEffect tidak overwrite nilai baru setelah refetch
        prefilled.current = false;
        queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
        queryClient.invalidateQueries({ queryKey: accountKeys.list() });
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      } else {
        setLastResult("error");
        setErrorMsg(res.message);
      }
    });
  }

  // ── Edit success ─────────────────────────────────────────────────────────────
  function handleEditSuccess() {
    setEditOpen(false);
    queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: accountKeys.list() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  }

  // ── Live preview: show diff while user is typing ─────────────────────────────
  const liveRealityCheck =
    rawValue ? parseFloat(rawValue) : null;

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen">
      {/* Header */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-6 pb-4">
        {/* Wave SVG */}
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(249 250 251)" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            {/* Back + name */}
            <div className="flex items-center space-x-3">
              <Link
                href="/accounts"
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                aria-label={t("backToList")}
              >
                <ChevronLeft className="w-7 h-7 text-white" />
              </Link>
              <div>
                {isLoading ? (
                  <div className="animate-pulse bg-white/30 h-6 w-32 rounded" />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-bold text-white">{account?.name} Balancing</h1>
                    </div>
                    <p className="text-blue-100 text-xs">{account?.account_type_name} - Reality check for your {account?.name}</p>
                  </>
                )}
              </div>
            </div>

            {/* Edit button */}
            {account && (
              <button
                onClick={() => setEditOpen(true)}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                aria-label={t("editAccount")}
              >
                <Pencil className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 mt-6 pb-24 space-y-4">
        {isLoading ? (
          <>
            <div className="animate-pulse bg-white rounded-2xl h-40 shadow-lg" />
            <div className="animate-pulse bg-white rounded-2xl h-48 shadow-lg" />
          </>
        ) : isError || !account ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-sm text-red-600">{t("loadFailed")}</p>
          </div>
        ) : (
          <>
            <CalculationBalanceCard
              account={account}
              liveRealityCheck={account.is_wallet ? liveWalletTotal : liveRealityCheck}
              hideBalances={hideBalances}
            />
            {/* Wallet: RealityCheckForm disembunyikan — total pecahan = reality balance */}
            {!account.is_wallet && (
              <RealityCheckForm
                accountName={account.name}
                value={rawValue}
                displayValue={displayValue}
                onChange={(raw, display) => {
                  setRawValue(raw);
                  setDisplayValue(display);
                  setLastResult(null);
                }}
                onSubmit={handleSubmit}
                isPending={isPending}
                lastResult={lastResult}
                successAmount={successAmount}
                successDiff={successDiff}
                errorMessage={errorMsg}
              />
            )}
            {account.is_wallet && (
              <WalletDenominations
                accountId={id}
                currentBalance={account.current_balance}
                onLiveTotal={setLiveWalletTotal}
                onSaveTotal={(total) => {
                  startTransition(async () => {
                    await updateRealityCheckAction(id, total);
                    queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
                    queryClient.invalidateQueries({ queryKey: accountKeys.list() });
                    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
                  });
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Edit bottom sheet (reuse from ../accounts/_components) */}
      {editOpen && account && (
        <AccountBottomSheet
          mode="edit"
          account={account}
          accountTypes={accountTypes ?? []}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
