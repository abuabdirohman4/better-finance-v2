import { describe, it, expect } from "vitest";
import { goalAllowed } from "../_lib/goalRule";

describe("goalAllowed", () => {
  it("allows spending and transfer", () => {
    expect(goalAllowed("spending")).toBe(true);
    expect(goalAllowed("transfer")).toBe(true);
  });
  it("rejects earning and unknown types", () => {
    expect(goalAllowed("earning")).toBe(false);
    expect(goalAllowed("")).toBe(false);
  });
});
