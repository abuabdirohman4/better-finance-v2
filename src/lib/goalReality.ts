// Goal reality check (bf-kvk): does each account still hold the goal money tagged into it?
export interface GoalAccountFlow {
  account_id: string;
  account_name: string;
  current_balance: number | string; // pg numeric may arrive as string
  amount: number | string; // signed: + goal transfer in, − goal spending out
}

export interface GoalRealityRow {
  account_id: string;
  account_name: string;
  allocated: number;
  balance: number;
  shortfall: number; // allocated − balance, always > 0 in the output
}

const EPS = 0.01;

/** Merge signed goal flows per account; return only accounts holding less than their goal allocation, biggest gap first. */
export function buildGoalRealityCheck(flows: GoalAccountFlow[]): GoalRealityRow[] {
  const byId = new Map<string, GoalRealityRow>();
  for (const f of flows) {
    const row = byId.get(f.account_id) ?? {
      account_id: f.account_id,
      account_name: f.account_name,
      allocated: 0,
      balance: Number(f.current_balance),
      shortfall: 0,
    };
    row.allocated += Number(f.amount);
    byId.set(f.account_id, row);
  }
  return [...byId.values()]
    .map((r) => ({ ...r, shortfall: r.allocated - r.balance }))
    .filter((r) => r.allocated > EPS && r.shortfall > EPS)
    .sort((a, b) => b.shortfall - a.shortfall);
}
