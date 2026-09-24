"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query";
import { getDashboard } from "../actions";

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const res = await getDashboard();
      if (!res.success) throw new Error(res.message ?? "Failed to load dashboard");
      return res.data!;
    },
    // Keep last numbers in cache across navigation; default 5-min GC caused the Rp 0 flash (app-t56b9d6).
    gcTime: Infinity,
  });
}
