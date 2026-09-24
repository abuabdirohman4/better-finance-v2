import { describe, expect, it } from "vitest";
import {
  checkDebtTag,
  debtStatus,
  ledgerDelta,
  ledgerDirection,
  ledgerOwed,
  movementLegs,
  summarizeDebt,
} from "../debt";

const L = "ledger";
const C = "cash";
const transfer = (from: string, to: string, amount: number) => ({
  transaction_type: "transfer",
  account_id: from,
  to_account_id: to,
  amount,
});

describe("ledgerDelta", () => {
  it("follows the balance RPC rule", () => {
    expect(ledgerDelta(transfer(C, L, 100), L)).toBe(100);
    expect(ledgerDelta(transfer(L, C, 100), L)).toBe(-100);
    expect(ledgerDelta({ transaction_type: "spending", account_id: L, to_account_id: null, amount: 50 }, L)).toBe(-50);
    expect(ledgerDelta({ transaction_type: "earning", account_id: L, to_account_id: null, amount: 50 }, L)).toBe(50);
    expect(ledgerDelta({ transaction_type: "spending", account_id: C, to_account_id: null, amount: 50 }, L)).toBe(0);
  });
});

describe("summarizeDebt", () => {
  it("receivable: lend 1000, collect 400", () => {
    const r = summarizeDebt("receivable", 0, L, [transfer(C, L, 1000), transfer(L, C, 400)]);
    expect(r).toEqual({ total: 1000, settled: 400, outstanding: 600 });
  });

  it("payable: borrow 1000, repay 1000", () => {
    const r = summarizeDebt("payable", 0, L, [transfer(L, C, 1000), transfer(C, L, 1000)]);
    expect(r).toEqual({ total: 1000, settled: 1000, outstanding: 0 });
  });

  it("opening amount counts as already owed", () => {
    expect(summarizeDebt("receivable", 500, L, [transfer(L, C, 200)]).outstanding).toBe(300);
    expect(summarizeDebt("payable", 500, L, [transfer(C, L, 200)]).outstanding).toBe(300);
  });

  it("ignores tagged rows that do not touch the ledger (e.g. interest paid from cash)", () => {
    const interest = { transaction_type: "spending", account_id: C, to_account_id: null, amount: 30 };
    expect(summarizeDebt("payable", 0, L, [transfer(L, C, 1000), interest]).outstanding).toBe(1000);
  });
});

describe("debtStatus", () => {
  it("settled at or below zero, overdue past due date, else open", () => {
    expect(debtStatus(0, "2026-01-01", "2026-09-24")).toBe("settled");
    expect(debtStatus(0.001, null, "2026-09-24")).toBe("settled");
    expect(debtStatus(100, "2026-09-23", "2026-09-24")).toBe("overdue");
    expect(debtStatus(100, "2026-09-24", "2026-09-24")).toBe("open");
    expect(debtStatus(100, null, "2026-09-24")).toBe("open");
  });
});

describe("movementLegs", () => {
  it("maps the four events to the right transfer direction", () => {
    expect(movementLegs("receivable", "increase", L, C)).toEqual({ account_id: C, to_account_id: L }); // lend
    expect(movementLegs("receivable", "settle", L, C)).toEqual({ account_id: L, to_account_id: C });   // collect
    expect(movementLegs("payable", "increase", L, C)).toEqual({ account_id: L, to_account_id: C });    // borrow
    expect(movementLegs("payable", "settle", L, C)).toEqual({ account_id: C, to_account_id: L });      // repay
  });

  it("round-trips through summarizeDebt", () => {
    for (const direction of ["receivable", "payable"] as const) {
      const inc = movementLegs(direction, "increase", L, C);
      const set = movementLegs(direction, "settle", L, C);
      const txs = [
        { transaction_type: "transfer", ...inc, amount: 1000 },
        { transaction_type: "transfer", ...set, amount: 250 },
      ];
      expect(summarizeDebt(direction, 0, L, txs).outstanding).toBe(750);
    }
  });
});

describe("ledger helpers", () => {
  it("direction and owed amount follow is_liability + natural sign", () => {
    expect(ledgerDirection(true)).toBe("payable");
    expect(ledgerDirection(false)).toBe("receivable");
    expect(ledgerOwed("receivable", 473900)).toBe(473900);
    expect(ledgerOwed("payable", -1000)).toBe(1000);
  });
});

describe("checkDebtTag", () => {
  it("accepts a transfer touching the ledger, rejects the rest", () => {
    expect(checkDebtTag(transfer(C, L, 1), L)).toBeNull();
    expect(checkDebtTag(transfer(L, C, 1), L)).toBeNull();
    expect(checkDebtTag({ ...transfer(C, L, 1), transaction_type: "spending" }, L)).toBe("debtTransferOnly");
    expect(checkDebtTag({ ...transfer(C, L, 1), goal_id: "g" }, L)).toBe("debtGoalConflict");
    expect(checkDebtTag(transfer(C, "other", 1), L)).toBe("debtAccountMismatch");
  });
});
