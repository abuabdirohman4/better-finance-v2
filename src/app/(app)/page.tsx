"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, DollarSign, Eye, EyeOff, Settings } from "lucide-react";
import { AccountCard } from "./accounts/_components/AccountCard";
import { useDashboard } from "./_hooks/useDashboard";
import { formatCurrency, formatDate } from "@/lib/helper";
import { usePrivacyStore } from "@/stores/privacyStore";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslations } from "next-intl";
import type { RecentTransactionRow } from "@/db/queries/accounts";

const MASK = "Rp •••.•••";
const TOP_ACCOUNTS = ["Wallet", "Mandiri", "BCA"];

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggle = usePrivacyStore((s) => s.toggleHideBalances);
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const ta = useTranslations("accounts");
  const tt = useTranslations("transactions");
  // Error only matters when there is no cached data to show — never render Rp 0 / empty for a failure.
  const loadFailed = isError && !data;

  const displayName = data?.user.displayName ?? "";
  const topAccounts =
    data?.accounts.filter((a) => TOP_ACCOUNTS.includes(a.name)).slice(0, 3) ??
    data?.accounts.slice(0, 3) ??
    [];

  return (
    <div className="bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen">
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
            <Avatar
              src={data?.user.avatarUrl}
              initials={data?.user.initials ?? ".."}
              className="w-11 h-11 bg-white/20 backdrop-blur-sm border border-white/30 text-white"
            />
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">
                {isLoading ? "..." : displayName.toUpperCase()}
              </h1>
              <p className="text-blue-200 text-sm">{data?.user.email ?? ""}</p>
            </div>
          </div>
          <Link
            href="/settings"
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <Settings className="w-5 h-5 text-white" />
          </Link>
        </div>
      </div>

      <div className="px-3 pb-8 mt-6 space-y-6">
        {/* Net Worth card */}
        <Link href="/net-worth" className="block bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow group">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{td("netWorth")}</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  toggle();
                }}
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
          ) : loadFailed || !data ? (
            <p className="text-sm text-red-600">{td("loadFailed")}</p>
          ) : (
            <p className="text-3xl font-bold text-gray-900">
              {hideBalances ? MASK : formatCurrency(data.totalAssets)}
            </p>
          )}
        </Link>

        {/* Top Used Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">{td("topAccounts")}</h2>
            <Link href="/accounts" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View All
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse bg-white rounded-2xl h-32 shadow-lg" />
              ))}
            </div>
          ) : loadFailed ? (
            <EmptyCard text={ta("loadFailed")} />
          ) : topAccounts.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {topAccounts.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`}>
                  <AccountCard account={a} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyCard text={ta("empty")} />
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">{td("recentTransactions")}</h2>
            <Link
              href="/transactions"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 h-12 rounded-xl" />
              ))}
            </div>
          ) : loadFailed ? (
            <p className="text-sm text-red-600">{tt("loadFailed")}</p>
          ) : (data?.recentTransactions.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {data!.recentTransactions.slice(0, 3).map((t) => (
                <TransactionRow key={t.id} tx={t} hide={hideBalances} />
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">{tt("empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ tx, hide }: { tx: RecentTransactionRow; hide: boolean }) {
  const isEarning = tx.transaction_type === "earning";
  const signed = isEarning ? tx.amount : -tx.amount;

  return (
    <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          isEarning ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
        }`}
      >
        {isEarning ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {tx.note || tx.category_name || "Transaksi"}
        </h4>
        <p className="text-xs text-gray-500">
          {formatDate(tx.transaction_date)}
          {tx.category_name ? ` • ${tx.category_name}` : ""}
        </p>
      </div>
      <div className={`text-sm font-semibold shrink-0 ${isEarning ? "text-green-600" : "text-red-600"}`}>
        {hide ? "Rp •••" : formatCurrency(signed, "signs")}
      </div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}
