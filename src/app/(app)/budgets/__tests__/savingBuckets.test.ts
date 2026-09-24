import { describe, it, expect } from "vitest";
import { buildSavingBuckets } from "../_lib/savingBuckets";
import type { SavingBudgetRow } from "@/db/queries/goals";

const row = (p: Partial<SavingBudgetRow>): SavingBudgetRow => ({
  goal_id: "g", goal_name: "G", goal_type: "Saving", monthly_target: 0, actual_saved: 0, percent: 0, ...p,
});

describe("buildSavingBuckets", () => {
  it("sums targets and actuals per goal_type bucket", () => {
    const out = buildSavingBuckets([
      row({ goal_id: "a", goal_type: "Saving", monthly_target: 1000, actual_saved: 500 }),
      row({ goal_id: "b", goal_type: "Saving", monthly_target: 1000, actual_saved: 1000 }),
      row({ goal_id: "c", goal_type: "Investment", monthly_target: 2000, actual_saved: 0 }),
    ]);
    expect(out.map((b) => b.type)).toEqual(["saving", "investing"]);
    expect(out[0]).toMatchObject({ target: 2000, actual: 1500, percent: 75 });
    expect(out[0].items).toHaveLength(2);
    expect(out[1]).toMatchObject({ target: 2000, actual: 0, percent: 0 });
  });

  it("hides goals with no target and no money this month, keeps untargeted goals that got money", () => {
    const out = buildSavingBuckets([
      row({ goal_id: "idle", monthly_target: 0, actual_saved: 0 }),
      row({ goal_id: "adhoc", monthly_target: 0, actual_saved: 300 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.goal_id)).toEqual(["adhoc"]);
    expect(out[0].percent).toBe(0); // no target → no percent
  });

  it("drops empty buckets", () => {
    expect(buildSavingBuckets([])).toEqual([]);
    expect(buildSavingBuckets([row({ goal_type: "Investment", monthly_target: 5 })]).map((b) => b.type)).toEqual(["investing"]);
  });
});
