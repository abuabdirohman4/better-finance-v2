"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountKeys, assetKeys, dashboardKeys, debtKeys, transactionKeys } from "@/lib/query";
import { getAccounts } from "@/app/(app)/accounts/actions";
import {
  getDebtsAction,
  createDebtAction,
  updateDebtAction,
  archiveDebtAction,
  recordDebtMovementAction,
} from "../actions";
import type { CreateDebtInput, UpdateDebtInput, DebtMovementInput } from "@/lib/schemas/debt";

export function useDebts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: debtKeys.list(),
    queryFn: async () => {
      const res = await getDebtsAction();
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

  // Movements change balances → everything balance-derived goes stale.
  const invalidate = () => {
    for (const queryKey of [debtKeys.all, accountKeys.all, assetKeys.all, transactionKeys.all, dashboardKeys.all]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (input: CreateDebtInput) => {
      const res = await createDebtAction(input);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateDebtInput }) => {
      const res = await updateDebtAction(id, input);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await archiveDebtAction(id);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: invalidate,
  });

  const movementMutation = useMutation({
    mutationFn: async (input: DebtMovementInput) => {
      const res = await recordDebtMovementAction(input);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: invalidate,
  });

  return { query, accountsQuery, createMutation, updateMutation, archiveMutation, movementMutation };
}
