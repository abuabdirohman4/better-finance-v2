"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { goalKeys, accountKeys } from "@/lib/query";
import {
  getGoalsAction,
  createGoalAction,
  updateGoalAction,
  deleteGoalAction,
  getGoalRealityCheckAction,
} from "../actions";
import { getAccounts } from "@/app/(app)/accounts/actions";
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/schemas/goal";

export function useGoals() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: goalKeys.list(),
    queryFn: async () => {
      const res = await getGoalsAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  const accountsQuery = useQuery({
    queryKey: accountKeys.list(),
    queryFn: async () => {
      const res = await getAccounts();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  const realityQuery = useQuery({
    queryKey: goalKeys.reality(),
    queryFn: async () => {
      const res = await getGoalRealityCheckAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      const res = await createGoalAction(input);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateGoalInput }) => {
      const res = await updateGoalAction(id, input);
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteGoalAction(id);
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
    },
  });

  return {
    query,
    accountsQuery,
    realityQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
