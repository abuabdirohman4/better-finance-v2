import { describe, it, expect } from "vitest";
import { buildGoalRealityCheck, type GoalAccountFlow } from "../goalReality";

const flow = (p: Partial<GoalAccountFlow>): GoalAccountFlow => ({
  account_id: "a", account_name: "Bibit", current_balance: 0, amount: 0, ...p,
});

describe("buildGoalRealityCheck", () => {
  it("flags an account holding less than its goal transfers", () => {
    const out = buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 3_000_000 })]);
    expect(out).toEqual([
      { account_id: "a", account_name: "Bibit", allocated: 5_000_000, balance: 3_000_000, shortfall: 2_000_000 },
    ]);
  });

  it("ignores accounts that hold at least their allocation (free cash is normal)", () => {
    expect(buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 9_000_000 })])).toEqual([]);
    expect(buildGoalRealityCheck([flow({ amount: 5_000_000, current_balance: 5_000_000 })])).toEqual([]);
  });

  it("nets goal spending out of the same account", () => {
    const out = buildGoalRealityCheck([
      flow({ amount: 5_000_000, current_balance: 3_000_000 }),
      flow({ amount: -2_000_000, current_balance: 3_000_000 }),
    ]);
    expect(out).toEqual([]);
  });

  it("ignores accounts whose allocation is zero or negative", () => {
    const out = buildGoalRealityCheck([
      flow({ account_id: "w", account_name: "Wallet", amount: -1_000_000, current_balance: 0 }),
    ]);
    expect(out).toEqual([]);
  });

  it("parses numeric strings, tolerates rounding, sorts by biggest shortfall", () => {
    const out = buildGoalRealityCheck([
      flow({ account_id: "x", account_name: "X", amount: "1000.004", current_balance: "1000" }),
      flow({ account_id: "s", account_name: "Small", amount: "300", current_balance: "200" }),
      flow({ account_id: "b", account_name: "Big", amount: "900", current_balance: "100" }),
    ]);
    expect(out.map((r) => r.account_id)).toEqual(["b", "s"]);
  });
});
