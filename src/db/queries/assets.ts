import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

export interface AssetRow {
  id: string;
  name: string;
  current_balance: number;
  asset_category: string; // "liquid" | "investment"
  investment_group: string | null;
  current_value: number | null;   // harga pasar, input manual (bf-3ai); null = belum dinilai
  last_valued_at: string | null;
  pnl: number | null;             // current_value − current_balance; null kalau belum dinilai
  is_liability: boolean;
  icon_name: string | null;
  color_hex: string | null;
}

/** Satu kartu di Net Worth: grup investasi (Emas, Reksadana, ...) atau akun tanpa grup. */
export interface InvestmentGroupRow {
  key: string;   // investment_group, atau id akun kalau tak bergrup — dipakai di URL /net-worth/[group]
  label: string; // nama tampil grup
  total: number;       // Σ current_balance (modal) — angka utama, dipakai Net Worth
  totalValue: number;  // Σ (current_value ?? current_balance) — produk belum dinilai dianggap at cost
  pnl: number;         // Σ pnl produk yang sudah dinilai
  valuedCount: number; // berapa produk punya current_value
  items: AssetRow[];
}

export interface AssetsSummary {
  assets: AssetRow[];
  liabilities: AssetRow[];
  totalLiquid: number;
  totalNonLiquid: number;
  totalLiabilities: number; // positive = owed (−Σ liability balances, natural sign)
  netWorth: number;
  investmentGroups: InvestmentGroupRow[];
}

export async function getAssets(userId: string): Promise<AssetsSummary> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      current_balance: sql<number>`${accounts.current_balance}::numeric`,
      asset_category: accounts.asset_category,
      investment_group: accounts.investment_group,
      current_value: accounts.current_value,
      last_valued_at: accounts.last_valued_at,
      is_liability: accounts.is_liability,
      icon_name: accounts.icon_name,
      color_hex: accounts.color_hex,
    })
    .from(accounts)
    .where(and(
      eq(accounts.user_id, userId),
      eq(accounts.is_active, true),
      eq(accounts.include_in_net_worth, true),
    ))
    .orderBy(accounts.asset_category, accounts.sort_order, accounts.name);

  const nonLiabilityRows = rows.filter((r) => !r.is_liability);
  const liabilityRows = rows.filter((r) => r.is_liability);

  const totalLiquid = nonLiabilityRows
    .filter((r) => r.asset_category === "liquid")
    .reduce((s, r) => s + Number(r.current_balance), 0);
  const totalNonLiquid = nonLiabilityRows
    .filter((r) => r.asset_category !== "liquid")
    .reduce((s, r) => s + Number(r.current_balance), 0);
  // Natural sign (bf-13t): liability balance is negative when owed → flip for a positive "owed" total.
  const totalLiabilities = -liabilityRows.reduce((s, r) => s + Number(r.current_balance), 0);

  const toAssetRow = (r: (typeof rows)[number]): AssetRow => {
    const balance = Number(r.current_balance);
    const value = r.current_value == null ? null : Number(r.current_value);
    return {
      ...r,
      current_balance: balance,
      current_value: value,
      last_valued_at: r.last_valued_at ? r.last_valued_at.toISOString() : null,
      pnl: value == null ? null : value - balance,
    };
  };
  const assetRows: AssetRow[] = nonLiabilityRows.map(toAssetRow);

  // Kartu non-liquid dikelompokkan per investment_group; akun tanpa grup jadi kartu sendiri.
  const groupMap = new Map<string, InvestmentGroupRow>();
  for (const a of assetRows) {
    if (a.asset_category === "liquid") continue;
    const key = a.investment_group ?? a.id;
    const valued = a.current_value != null;
    const group = groupMap.get(key);
    if (group) {
      group.total += a.current_balance;
      group.totalValue += a.current_value ?? a.current_balance;
      group.pnl += a.pnl ?? 0;
      group.valuedCount += valued ? 1 : 0;
      group.items.push(a);
    } else {
      groupMap.set(key, {
        key,
        label: a.investment_group ?? a.name,
        total: a.current_balance,
        totalValue: a.current_value ?? a.current_balance,
        pnl: a.pnl ?? 0,
        valuedCount: valued ? 1 : 0,
        items: [a],
      });
    }
  }

  return {
    assets: assetRows,
    liabilities: liabilityRows.map(toAssetRow),
    totalLiquid,
    totalNonLiquid,
    totalLiabilities,
    netWorth: totalLiquid + totalNonLiquid - totalLiabilities,
    investmentGroups: [...groupMap.values()].sort((a, b) => b.total - a.total),
  };
}
