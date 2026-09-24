"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Eye, EyeOff, ShoppingBag, Wallet, Info } from "lucide-react";
import { useWishlist } from "./_hooks/useWishlist";
import { WishlistCard } from "./_components/WishlistCard";
import { WishlistBottomSheet } from "./_components/WishlistBottomSheet";
import { Tooltip } from "@/components/ui/Tooltip";
import { Fab } from "@/components/layouts/Fab";
import { formatCurrency } from "@/lib/helper";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTranslations } from "next-intl";
import type { WishlistRow } from "@/db/queries/wishlist";

const MASK = "Rp •••.•••";

type TabStatus = "active" | "purchased" | "cancelled";

export default function WishlistPage() {
  const [tab, setTab] = useState<TabStatus>("active");
  const { query, affordability, createMutation, updateMutation, deleteMutation, promoteMutation } = useWishlist(tab);
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggle = usePrivacyStore((s) => s.toggleHideBalances);
  const t = useTranslations("wishlist");
  const tc = useTranslations("common");

  // Bottom sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<WishlistRow | null>(null);

  // Promote dialog state
  const [promoteItem, setPromoteItem] = useState<WishlistRow | null>(null);

  const liquidBalance = affordability.data?.liquidBalance ?? 0;
  const freeCash = affordability.data?.freeCash ?? 0;
  const allocated = affordability.data?.allocated ?? 0;
  const items = query.data ?? [];
  const affordableCount = items.filter((i) => freeCash >= i.estimated_price).length;

  function openCreate() {
    setEditItem(null);
    setSheetOpen(true);
  }

  function openEdit(item: WishlistRow) {
    setEditItem(item);
    setSheetOpen(true);
  }

  async function handleSave(data: {
    name: string;
    description?: string | null;
    url?: string | null;
    estimated_price: number;
    priority: number;
    target_date?: string | null;
    status?: "active" | "purchased" | "cancelled";
  }) {
    if (editItem) {
      await updateMutation.mutateAsync({ id: editItem.id, input: data });
    } else {
      await createMutation.mutateAsync(data);
    }
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync(id);
  }

  async function handlePromote() {
    if (!promoteItem) return;
    await promoteMutation.mutateAsync({
      wishlistId: promoteItem.id,
    });
    setPromoteItem(null);
  }

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const mutationError = createMutation.error?.message || updateMutation.error?.message || deleteMutation.error?.message || null;

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen pb-24">
      {/* Header gradient */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-6 py-7">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(249 250 251)" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors">
              <ChevronLeft className="w-7 h-7" />
            </Link>
            <h1 className="text-xl font-bold text-white">{t("title")}</h1>
          </div>
          <button
            onClick={toggle}
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
            aria-label={tc("toggleBalance")}
          >
            {hideBalances ? <EyeOff className="w-5 h-5 text-white" /> : <Eye className="w-5 h-5 text-white" />}
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 mt-6 space-y-5">
        {/* Affordability summary */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-linear-to-r from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <Tooltip
                trigger={
                  <span className="text-sm text-gray-500 font-medium flex items-center gap-1">
                    Free Cash <Info className="w-3.5 h-3.5 text-gray-400" />
                  </span>
                }
              >
                <p className="font-semibold text-sm mb-1">{t("freeCashBreakdown")}</p>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-300">{t("liquidBalance")}</span>
                  <span className="font-medium">{hideBalances ? MASK : formatCurrency(liquidBalance)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-300">− Saved in goals</span>
                  <span className="font-medium text-amber-300">{hideBalances ? MASK : formatCurrency(allocated)}</span>
                </div>
                <div className="border-t border-gray-700 pt-1.5 flex justify-between gap-4">
                  <span className="text-gray-200 font-semibold">= Free cash</span>
                  <span className="font-bold text-emerald-300">{hideBalances ? MASK : formatCurrency(freeCash)}</span>
                </div>
                <p className="text-gray-400 pt-1 leading-snug">
                  {freeCash === 0
                    ? "All liquid balance is already reserved (goals / emergency fund)."
                    : "Free cash = balance with no assigned purpose, safe to spend on wishlist."}
                </p>
              </Tooltip>

              <p className="text-xl font-bold text-gray-900">
                {hideBalances ? MASK : formatCurrency(freeCash)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                of {hideBalances ? MASK : formatCurrency(liquidBalance)} liquid · rest reserved for goals & emergency fund
              </p>
            </div>
          </div>
          {tab === "active" && items.length > 0 && (
            <p className="text-sm text-gray-600">
              You can afford <span className="font-bold text-emerald-600">{affordableCount}</span> of{" "}
              <span className="font-bold">{items.length}</span> items without touching allocations
            </p>
          )}
        </div>

        {/* Tab filter */}
        <div className="flex gap-2">
          {(["active", "purchased", "cancelled"] as TabStatus[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === t
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t === "active" ? "Active" : t === "purchased" ? "Purchased" : "Cancelled"}
            </button>
          ))}
        </div>

        {/* Items list */}
        {query.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl h-28 animate-pulse shadow-sm border border-gray-100" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-red-500 text-sm">⚠️ Failed to load wishlist.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100 border-dashed">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">
              {tab === "active"
                ? "No wishlist items yet."
                : tab === "purchased"
                ? "No purchased items yet."
                : "No cancelled items yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                liquidBalance={liquidBalance}
                freeCash={freeCash}
                onEdit={openEdit}
                onPromote={setPromoteItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <Fab onClick={openCreate} label={t("addWishlist")} />

      {/* Bottom sheet */}
      <WishlistBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={editItem}
        onSave={handleSave}
        onDelete={handleDelete}
        isPending={isPending}
        error={mutationError}
      />

      {/* Promote dialog */}
      {promoteItem && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 cursor-pointer transition-opacity duration-300"
            onClick={() => setPromoteItem(null)}
          />
          <div
            className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300"
            style={{ transform: "translate(-50%, 0)" }}
          >
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">🎯 Start Saving</h2>
              <p className="text-sm text-gray-500 mb-4">
                Create a goal from <span className="font-semibold">&ldquo;{promoteItem.name}&rdquo;</span> with a target of{" "}
                <span className="font-bold">{hideBalances ? MASK : formatCurrency(promoteItem.estimated_price)}</span>
              </p>

              {promoteMutation.error && (
                <div className="mb-3 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
                  {promoteMutation.error.message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setPromoteItem(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePromote}
                  disabled={promoteMutation.isPending}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {promoteMutation.isPending ? "Creating..." : "Create Goal"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
