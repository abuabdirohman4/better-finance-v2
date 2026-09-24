export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type Month = (typeof MONTHS)[number];

export const MONTH_NUMBERS: Record<Month, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export type TransactionType = "spending" | "earning" | "transfer";

export type AssetCategory = "liquid" | "investment";

export type DebtDirection = "receivable" | "payable";

export type GoalType = "sinking" | "wishlist" | "emergency" | "investment" | "business";

export type PlanTier = "free" | "pro" | "family";

export type CategoryGroup =
  | "earning"
  | "eating"
  | "living"
  | "saving"
  | "investing"
  | "giving";

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  earning: "Earning",
  eating: "Eating",
  living: "Living",
  saving: "Saving",
  investing: "Investing",
  giving: "Giving",
};

export const DEFAULT_CATEGORIES: Array<{ name: string; slug: string; group: CategoryGroup }> = [
  // eating
  { name: "Dining Out", slug: "dining-out", group: "eating" },
  { name: "Food", slug: "food", group: "eating" },
  { name: "Fruits", slug: "fruits", group: "eating" },
  { name: "Groceries", slug: "groceries", group: "eating" },
  { name: "Grab Credit", slug: "grab-credit", group: "eating" },
  // living
  { name: "Charge", slug: "charge", group: "living" },
  { name: "Credit", slug: "credit", group: "living" },
  { name: "Children", slug: "children", group: "living" },
  { name: "Entertainment", slug: "entertainment", group: "living" },
  { name: "Health", slug: "health", group: "living" },
  { name: "House", slug: "house", group: "living" },
  { name: "Knowledge", slug: "knowledge", group: "living" },
  { name: "Spouse", slug: "spouse", group: "living" },
  { name: "Tools", slug: "tools", group: "living" },
  { name: "Transport", slug: "transport", group: "living" },
  { name: "Other Spend", slug: "other-spend", group: "living" },
  // saving (AP/AR removed, bf-13t: debts live in the debts table)
  { name: "Retained", slug: "retained", group: "saving" },
  { name: "Sinking", slug: "sinking", group: "saving" },
  { name: "Wishlist", slug: "wishlist", group: "saving" },
  // investing
  { name: "Business", slug: "business", group: "investing" },
  { name: "Emergency", slug: "emergency", group: "investing" },
  { name: "Investment", slug: "investment", group: "investing" },
  // giving
  { name: "Infaq Rezeki", slug: "infaq-rezeki", group: "giving" },
  { name: "Tax Salary", slug: "tax-salary", group: "giving" },
  { name: "Shodaqoh", slug: "shodaqoh", group: "giving" },
  // earning
  { name: "Net Salary", slug: "net-salary", group: "earning" },
  { name: "Salary", slug: "salary", group: "earning" },
  { name: "Allowance", slug: "allowance", group: "earning" },
  { name: "Interest", slug: "interest", group: "earning" },
  { name: "Other Earn", slug: "other-earn", group: "earning" },
];
