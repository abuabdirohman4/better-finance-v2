import { describe, it, expect } from "vitest";
import { getCurrentWeekNumber, getWeeksInMonth } from "../_utils/dateCalculations";

describe("getCurrentWeekNumber", () => {
  const sep24 = new Date(2026, 8, 24, 10, 0);

  it("bulan berjalan → minggu berjalan", () => {
    expect(getWeeksInMonth(2026, 9)).toBe(5);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 1, 8, 0))).toBe(1);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 7, 0, 0))).toBe(2);
    expect(getCurrentWeekNumber(2026, 9, sep24)).toBe(4);
    expect(getCurrentWeekNumber(2026, 9, new Date(2026, 8, 30, 23, 0))).toBe(5);
  });

  it("bulan/tahun lain → Week 1", () => {
    expect(getCurrentWeekNumber(2026, 8, sep24)).toBe(1);
    expect(getCurrentWeekNumber(2026, 10, sep24)).toBe(1);
    expect(getCurrentWeekNumber(2025, 9, sep24)).toBe(1);
  });
});
