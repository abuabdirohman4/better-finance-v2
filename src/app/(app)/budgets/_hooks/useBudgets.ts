"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetKeys } from "@/lib/query";
import {
  getBudgetsAction,
  getIncomeBudgetsAction,
  getTransferBudgetsAction,
  getGoalFundedSpendingAction,
  upsertBudgetAction,
  deleteBudgetAction,
  getCategoriesForBudgetAction,
} from "../actions";
import type { UpsertBudgetInput } from "@/lib/schemas/budget";

export function useBudgets(year: number, month: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: budgetKeys.withSpending(year, month),
    queryFn: async () => {
      const res = await getBudgetsAction(year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  const incomeQuery = useQuery({
    queryKey: budgetKeys.income(year, month),
    queryFn: async () => {
      const res = await getIncomeBudgetsAction(year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  const transferQuery = useQuery({
    queryKey: budgetKeys.saving(year, month),
    queryFn: async () => {
      const res = await getTransferBudgetsAction(year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  const fundedQuery = useQuery({
    queryKey: budgetKeys.goalFunded(year, month),
    queryFn: async () => {
      const res = await getGoalFundedSpendingAction(year, month);
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["budget-categories"],
    queryFn: async () => {
      const res = await getCategoriesForBudgetAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (input: UpsertBudgetInput) => upsertBudgetAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBudgetAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });

  return {
    query,
    incomeQuery,
    transferQuery,
    fundedQuery,
    categoriesQuery,
    upsertMutation,
    deleteMutation,
  };
}
