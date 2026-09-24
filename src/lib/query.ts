"use client";

import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,           // 30 detik
        refetchOnWindowFocus: false,     // cegah refetch saat tab switch — hemat egress
        refetchOnReconnect: true,
        retry: 2,
      },
    },
  });
}

// TanStack Query key generators — satu sumber kebenaran untuk cache keys
export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
  detail: (id: string) => [...accountKeys.all, "detail", id] as const,
  balances: () => [...accountKeys.all, "balances"] as const,
  snapshots: (accountId: string) => [...accountKeys.all, "snapshots", accountId] as const,
};

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (filters?: unknown) => [...transactionKeys.all, "list", filters] as const,
  byMonth: (year: number, month: number) =>
    [...transactionKeys.all, "month", year, month] as const,
  detail: (id: string) => [...transactionKeys.all, "detail", id] as const,
  goalsForTransfer: () => [...transactionKeys.all, "goals-for-transfer"] as const,
};

export const budgetKeys = {
  all: ["budgets"] as const,
  monthly: (year: number, month: number) => [...budgetKeys.all, year, month] as const,
  withSpending: (year: number, month: number) =>
    [...budgetKeys.all, "with-spending", year, month] as const,
  income: (year: number, month: number) =>
    [...budgetKeys.all, "income", year, month] as const,
  saving: (year: number, month: number) =>
    [...budgetKeys.all, "saving", year, month] as const,
  goalFunded: (year: number, month: number) =>
    [...budgetKeys.all, "goal-funded", year, month] as const,
};

export const goalKeys = {
  all: ["goals"] as const,
  list: () => [...goalKeys.all, "list"] as const,
  detail: (id: string) => [...goalKeys.all, "detail", id] as const,
};

export const assetKeys = {
  all: ["assets"] as const,
  list: () => [...assetKeys.all, "list"] as const,
  netWorth: () => [...assetKeys.all, "net-worth"] as const,
  summary: () => [...assetKeys.all, "summary"] as const,
};

export const categoryKeys = {
  all: ["categories"] as const,
  list: () => [...categoryKeys.all, "list"] as const,
  manage: () => [...categoryKeys.all, "manage"] as const,
  byGroup: (group: string) => [...categoryKeys.all, "group", group] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

export const wishlistKeys = {
  all: ["wishlist"] as const,
  list: (status?: string) => [...wishlistKeys.all, "list", status] as const,
  detail: (id: string) => [...wishlistKeys.all, "detail", id] as const,
};

export const walletDenominationKeys = {
  all: ["wallet-denominations"] as const,
  byAccount: (accountId: string) => [...walletDenominationKeys.all, accountId] as const,
};

