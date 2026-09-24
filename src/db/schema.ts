import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ── user_profiles ─────────────────────────────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  display_name: text("display_name"),
  email: text("email").notNull(),
  avatar_url: text("avatar_url"),
  plan_tier: text("plan_tier").notNull().default("free"),
  plan_expires_at: timestamp("plan_expires_at", { withTimezone: true }),
  stripe_customer_id: text("stripe_customer_id").unique(),
  currency_code: text("currency_code").notNull().default("IDR"),
  locale: text("locale").notNull().default("id-ID"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  onboarding_completed: boolean("onboarding_completed").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── account_types ─────────────────────────────────────────────────────────────

export const accountTypes = pgTable(
  "account_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color_hex: text("color_hex"),
    icon_name: text("icon_name"),
    sort_order: integer("sort_order").notNull().default(0),
    is_system: boolean("is_system").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.user_id, t.slug)]
);

// ── accounts ──────────────────────────────────────────────────────────────────

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    account_type_id: uuid("account_type_id")
      .notNull()
      .references(() => accountTypes.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    current_balance: numeric("current_balance", { precision: 18, scale: 2 }).notNull().default("0"),
    last_reality_check: numeric("last_reality_check", { precision: 18, scale: 2 }),
    last_reality_check_at: timestamp("last_reality_check_at", { withTimezone: true }),
    asset_category: text("asset_category").notNull().default("liquid"),
    investment_group: text("investment_group"),
    current_value: numeric("current_value", { precision: 18, scale: 2 }),
    last_valued_at: timestamp("last_valued_at", { withTimezone: true }),
    icon_name: text("icon_name"),
    color_hex: text("color_hex"),
    is_active: boolean("is_active").notNull().default(true),
    include_in_net_worth: boolean("include_in_net_worth").notNull().default(true),
    is_wallet: boolean("is_wallet").notNull().default(false),
    is_liability: boolean("is_liability").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.user_id, t.slug)]
);

// ── wallet_denominations ──────────────────────────────────────────────────────

export const walletDenominations = pgTable(
  "wallet_denominations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    denomination: integer("denomination").notNull(),
    note_type: text("note_type").notNull().default("paper"),
    count: integer("count").notNull().default(0),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.account_id, t.denomination, t.note_type)]
);

// ── categories ────────────────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    group_name: text("group_name").notNull(),
    icon_name: text("icon_name"),
    color_hex: text("color_hex"),
    sort_order: integer("sort_order").notNull().default(0),
    is_system: boolean("is_system").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.user_id, t.slug, t.group_name)]
);

// ── transactions ──────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    transaction_date: date("transaction_date").notNull(),
    transaction_type: text("transaction_type").notNull(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    category_id: uuid("category_id").references(() => categories.id),
    to_account_id: uuid("to_account_id").references(() => accounts.id),
    goal_id: uuid("goal_id").references(() => savingsGoals.id, { onDelete: "set null" }),
    debt_id: uuid("debt_id").references(() => debts.id, { onDelete: "set null" }),
    note: text("note"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    source_month: text("source_month"),
    budget_period: date("budget_period"),
    is_imported: boolean("is_imported").notNull().default(false),
    import_row_hash: text("import_row_hash"),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_transactions_user_date").on(t.user_id, t.transaction_date),
    index("idx_transactions_user_type").on(t.user_id, t.transaction_type),
    index("idx_transactions_user_account").on(t.user_id, t.account_id),
    index("idx_transactions_user_category").on(t.user_id, t.category_id),
    index("idx_transactions_goal_id").on(t.goal_id),
    index("idx_transactions_debt_id").on(t.debt_id),
  ]
);

// ── budgets ───────────────────────────────────────────────────────────────────

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    budget_year: smallint("budget_year").notNull(),
    budget_month: smallint("budget_month").notNull(),
    category_id: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    budgeted_amount: numeric("budgeted_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.user_id, t.budget_year, t.budget_month, t.category_id),
    index("idx_budgets_user_period").on(t.user_id, t.budget_year, t.budget_month),
  ]
);

// ── savings_goals ─────────────────────────────────────────────────────────────

export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  icon_name: text("icon_name"),
  account_id: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  goal_type: text("goal_type").notNull(),
  target_amount: numeric("target_amount", { precision: 18, scale: 2 }).notNull(),
  monthly_contribution: numeric("monthly_contribution", { precision: 18, scale: 2 }),
  deadline_date: date("deadline_date"),
  duration_label: text("duration_label"),
  collected_amount: numeric("collected_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  retained_amount: numeric("retained_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  is_completed: boolean("is_completed").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── debts (AP/AR, bf-13t) ─────────────────────────────────────────────────────
// Metadata only. Money moves via transfers tagged transactions.debt_id; outstanding is derived.

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // "receivable" | "payable" (DB CHECK)
    counterparty: text("counterparty").notNull(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => accounts.id), // ledger account
    opening_amount: numeric("opening_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    due_date: date("due_date"),
    note: text("note"),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_debts_user").on(t.user_id, t.direction)]
);

// ── account_balance_snapshots ─────────────────────────────────────────────────

export const accountBalanceSnapshots = pgTable(
  "account_balance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    account_id: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    snapshot_type: text("snapshot_type").notNull().default("computed"),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
    note: text("note"),
    snapped_at: timestamp("snapped_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_balance_snapshots_account_time").on(t.account_id, t.snapped_at)]
);

// ── wishlists ─────────────────────────────────────────────────────────────────

export const wishlists = pgTable("wishlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url"),
  image_url: text("image_url"),
  estimated_price: numeric("estimated_price", { precision: 18, scale: 2 }).notNull(),
  priority: smallint("priority").notNull().default(3),
  status: text("status").notNull().default("active"),
  linked_goal_id: uuid("linked_goal_id").references(() => savingsGoals.id),
  target_date: date("target_date"),
  purchased_at: timestamp("purchased_at", { withTimezone: true }),
  purchased_price: numeric("purchased_price", { precision: 18, scale: 2 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── ai_insights ───────────────────────────────────────────────────────────────

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  insight_type: text("insight_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  related_category_id: uuid("related_category_id").references(() => categories.id),
  related_account_id: uuid("related_account_id").references(() => accounts.id),
  related_goal_id: uuid("related_goal_id").references(() => savingsGoals.id),
  is_read: boolean("is_read").notNull().default(false),
  is_dismissed: boolean("is_dismissed").notNull().default(false),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  model_version: text("model_version"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  generated_at: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
