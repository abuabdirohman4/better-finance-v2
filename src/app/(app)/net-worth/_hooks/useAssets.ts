"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assetKeys, dashboardKeys } from "@/lib/query";
import { getAssetsAction, updateAccountValueAction } from "../actions";

export function useAssets() {
  return useQuery({
    queryKey: assetKeys.summary(),
    queryFn: async () => {
      const res = await getAssetsAction();
      if (!res.success) throw new Error(res.message);
      return res.data!;
    },
  });
}

export function useUpdateAccountValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, value }: { accountId: string; value: number | null }) => {
      const res = await updateAccountValueAction(accountId, value);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}
