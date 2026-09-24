"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { useGoals } from "./_hooks/useGoals";
import { GoalCategoryCard } from "./_components/GoalCategoryCard";
import { GoalBottomSheet } from "./_components/GoalBottomSheet";
import { Fab } from "@/components/layouts/Fab";
import { usePrivacyStore } from "@/stores/privacyStore";
import { formatCurrency } from "@/lib/helper";
import { useTranslations } from "next-intl";
import type { GoalRow } from "@/db/queries/goals";
import type { CreateGoalInput } from "@/lib/schemas/goal";

export default function GoalsPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalRow | null>(null);
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const t = useTranslations("goals");
  const tc = useTranslations("common");

  const { query, realityQuery, createMutation, updateMutation, deleteMutation } = useGoals();
  const goals = query.data ?? [];
  const shortAccounts = realityQuery.data ?? [];

  const savingGoals = goals.filter((g) => g.goal_type === "Saving");
  const investingGoals = goals.filter((g) => g.goal_type === "Investment");

  const totalTarget = goals.reduce((s, g) => s + Number(g.target_amount), 0);
  const totalCollected = goals.reduce((s, g) => s + Number(g.collected_amount), 0);
  const overallPercent = totalTarget > 0 ? (totalCollected / totalTarget) * 100 : 0;

  function openCreate() {
    setEditGoal(null);
    setSheetOpen(true);
  }

  function openEdit(g: GoalRow) {
    setEditGoal(g);
    setSheetOpen(true);
  }

  const handleSave = async (input: CreateGoalInput & { collected_amount?: number }) => {
    if (editGoal) {
      await updateMutation.mutateAsync({ id: editGoal.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const MASK = "Rp •••";

  return (
    <div className="bg-blue-50 min-h-screen">
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-4 pt-5 pb-6">
        <div className="absolute bottom-0 left-0 w-full h-8">
          <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,32 Q100,20 200,32 T400,20 L400,32 Z" fill="rgb(239 246 255)" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label={tc("back")}>
              <ChevronLeft className="w-7 h-7 text-white" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">{t("title")}</h1>
              <p className="text-blue-100 text-sm">{t("subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 pb-24 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-bold text-gray-900 text-lg">{t("overallProgress")}</h2>
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <div className="text-center flex-1">
              <p className="text-sm text-gray-500 mb-1">{t("totalCollected")}</p>
              <p className="font-bold text-green-600 text-lg">{hideBalances ? MASK : formatCurrency(totalCollected)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-sm text-gray-500 mb-1">{t("totalTarget")}</p>
              <p className="font-bold text-gray-900 text-lg">{hideBalances ? MASK : formatCurrency(totalTarget)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(overallPercent, 100)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-red-600 w-10 text-right shrink-0">
              {overallPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {shortAccounts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-amber-900">{t("realityTitle")}</h2>
                <p className="text-xs text-amber-800">{t("realityHint")}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {shortAccounts.map((r) => (
                <li key={r.account_id} className="bg-white rounded-xl px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2 font-medium text-gray-900">
                    <span className="truncate">{r.account_name}</span>
                    <span className="text-red-600 shrink-0">
                      {hideBalances ? MASK : `-${formatCurrency(r.shortfall)}`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t("realityDetail", {
                      allocated: hideBalances ? MASK : formatCurrency(r.allocated),
                      balance: hideBalances ? MASK : formatCurrency(r.balance),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {query.isLoading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse h-32" />
            ))}
          </div>
        )}

        {!query.isLoading && goals.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🎯</span>
            </div>
            <h3 className="font-bold text-gray-900 mb-1">{t("empty")}</h3>
            <p className="text-sm text-gray-500 mb-6">{t("emptyHint")}</p>
            <button
              onClick={openCreate}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              {t("createFirst")}
            </button>
          </div>
        )}

        {(!query.isLoading && (savingGoals.length > 0 || investingGoals.length > 0)) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">{t("financialGoals")}</h2>
            </div>
            <div className="p-4 bg-slate-50/50">
              <GoalCategoryCard
                title={t("saving")}
                type="Saving"
                goals={savingGoals}
                onEdit={openEdit}
                hideBalances={hideBalances}
              />
              <GoalCategoryCard
                title={t("investment")}
                type="Investment"
                goals={investingGoals}
                onEdit={openEdit}
                hideBalances={hideBalances}
              />
            </div>
          </div>
        )}
      </div>

      <Fab onClick={openCreate} />

      <GoalBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        goal={editGoal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
