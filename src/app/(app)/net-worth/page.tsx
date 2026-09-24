"use client";

import { Eye, EyeOff, Wallet, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useAssets } from "./_hooks/useAssets";
import { formatCurrency } from "@/lib/helper";
import { usePrivacyStore } from "@/stores/privacyStore";
import { getAccountVisual } from "@/lib/accountVisuals";
import { useTranslations } from "next-intl";
import type { AssetRow, InvestmentGroupRow } from "@/db/queries/assets";

const MASK = "Rp •••.•••";

export default function AssetsPage() {
  const { data, isLoading, isError } = useAssets();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggle = usePrivacyStore((s) => s.toggleHideBalances);
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const te = useTranslations("error");

  const { liabilities = [], investmentGroups = [], totalLiquid = 0, totalNonLiquid = 0, totalLiabilities = 0, netWorth = 0 } = data ?? {};
  
  const liquidPercent = netWorth > 0 ? (totalLiquid / netWorth) * 100 : 0;
  const nonLiquidPercent = netWorth > 0 ? (totalNonLiquid / netWorth) * 100 : 0;

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen pb-24">
      {/* Header gradient */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-blue-700 to-indigo-800 px-6 py-7">
        {/* Wave shape bawah */}
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

      <div className="px-4 pb-8 mt-6 space-y-6">
        {/* Total Assets card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("totalNetWorth")}</p>
          {isLoading ? (
            <div className="animate-pulse bg-gray-200 h-10 w-48 rounded" />
          ) : (
            <h2 className="text-4xl font-bold text-gray-900 tracking-tight">
              {hideBalances ? MASK : formatCurrency(netWorth)}
            </h2>
          )}
        </div>

        {/* Breakdown bar */}
        <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
          <div className="flex justify-between items-center mb-3 text-sm font-semibold">
            <span className="text-blue-600 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Liquid
            </span>
            <span className="text-emerald-600 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Non-Liquid
            </span>
          </div>
          
          <div className="h-3 w-full flex rounded-full overflow-hidden bg-gray-100 mb-3">
            <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${liquidPercent}%` }}></div>
            <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${nonLiquidPercent}%` }}></div>
          </div>
          
          <div className="flex justify-between items-center text-sm font-bold text-gray-900">
            <span>{hideBalances ? MASK : formatCurrency(totalLiquid, "short")}</span>
            <span>{hideBalances ? MASK : formatCurrency(totalNonLiquid, "short")}</span>
          </div>
        </div>

        {/* Grid gabung: kartu "Accounts" (agregat liquid) + non-liquid per akun. Liquid/non-liquid dibedakan warna kartu. */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        ) : isError ? (
          <p className="text-red-500 text-sm px-1">{te("loadData")}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {/* Kartu Accounts = agregat semua akun liquid, klik -> /accounts */}
              <Link href="/accounts" className="block bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden active:scale-95 transition-transform hover:shadow-xl group">
                <div className="flex flex-col items-center p-3 pb-3">
                  <div className="mb-1.5 w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <Wallet className="w-5 h-5" strokeWidth={1.8} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-xs text-center group-hover:text-blue-600 transition-colors">{t("accounts")}</h3>
                </div>
                <div className="text-center py-1.5 px-1 mt-auto bg-blue-100/50 text-blue-600">
                  <p className="font-bold text-[9px] truncate">
                    {hideBalances ? MASK : formatCurrency(totalLiquid)}
                  </p>
                </div>
              </Link>

              {/* Non-liquid per grup investasi — tap masuk ke detail sub-produk */}
              {investmentGroups.map(g => (
                <GroupCard key={g.key} group={g} hideBalances={hideBalances} />
              ))}
            </div>

            {/* Liabilities section — hanya tampil jika ada */}
            {(liabilities?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">{t("liabilities")}</h3>
                <div className="grid grid-cols-3 gap-3">
                  {liabilities.map((a) => (
                    <LiabilityCard key={a.id} asset={a} hideBalances={hideBalances} />
                  ))}
                </div>
                <div className="mt-2 text-right text-sm text-red-600 font-semibold">
                  -{hideBalances ? MASK : formatCurrency(totalLiabilities)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({ group, hideBalances }: { group: InvestmentGroupRow; hideBalances: boolean }) {
  const initials = getAccountVisual(group.label).initials || group.label.substring(0, 2).toUpperCase();

  return (
    <Link
      href={`/net-worth/${encodeURIComponent(group.key)}`}
      className="block bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden active:scale-95 transition-transform hover:shadow-xl group"
    >
      <div className="flex flex-col items-center p-3 pb-3">
        <div className="mb-1.5 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">
          {initials}
        </div>
        <h3 className="font-bold text-gray-900 text-xs text-center truncate w-full group-hover:text-blue-600 transition-colors">
          {group.label}
        </h3>
      </div>
      <div className="text-center py-1.5 px-1 mt-auto bg-emerald-100/50 text-emerald-700">
        <p className="font-bold text-[9px] truncate">
          {hideBalances ? MASK : formatCurrency(group.total)}
        </p>
        {/* P&L tampil hanya kalau ada produk yang sudah dinilai (bf-3ai) */}
        {group.valuedCount > 0 && !hideBalances && (
          <p className={`text-[9px] font-semibold truncate ${group.pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {group.pnl >= 0 ? "+" : "-"}{formatCurrency(Math.abs(group.pnl), "short")}
          </p>
        )}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col">
      <div className="flex flex-col items-center p-3 pb-3">
        <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse mb-1.5" />
        <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
      </div>
      <div className="h-6 bg-gray-100 mt-auto" />
    </div>
  );
}

function LiabilityCard({ asset, hideBalances }: { asset: AssetRow; hideBalances: boolean }) {
  const visual = getAccountVisual(asset.name);
  const initials = visual.initials || asset.name.substring(0, 2).toUpperCase();
  return (
    <div className="bg-white rounded-2xl shadow-md border border-red-100 overflow-hidden flex flex-col">
      <div className="flex flex-col items-center p-3 pb-3">
        <div className="mb-1.5 w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">
          {initials}
        </div>
        <h3 className="font-bold text-gray-900 text-xs text-center truncate w-full">{asset.name}</h3>
      </div>
      <div className="text-center py-1.5 px-1 mt-auto bg-red-100/50 text-red-600">
        <p className="font-bold text-[9px] truncate">
          -{hideBalances ? MASK : formatCurrency(asset.current_balance)}
        </p>
      </div>
    </div>
  );
}
