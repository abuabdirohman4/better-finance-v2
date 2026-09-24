import type { SavingBudgetRow } from "@/db/queries/goals";

export interface SavingBucket {
  type: "saving" | "investing";
  target: number;
  actual: number;
  percent: number;
  items: SavingBudgetRow[];
}

// goal_type "Saving" → saving bucket, anything else ("Investment") → investing. Goals with no target and no
// money moved this month are hidden; empty buckets are dropped.
export function buildSavingBuckets(rows: SavingBudgetRow[]): SavingBucket[] {
  return (["saving", "investing"] as const)
    .map((type) => {
      const items = rows.filter(
        (r) =>
          (r.goal_type === "Saving" ? "saving" : "investing") === type &&
          (r.monthly_target > 0 || r.actual_saved > 0)
      );
      const target = items.reduce((s, r) => s + r.monthly_target, 0);
      const actual = items.reduce((s, r) => s + r.actual_saved, 0);
      return { type, target, actual, percent: target > 0 ? (actual / target) * 100 : 0, items };
    })
    .filter((b) => b.items.length > 0);
}
