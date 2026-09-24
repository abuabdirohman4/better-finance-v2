import type { DebtDirection } from "@/lib/constants";

export type DebtStatus = "open" | "overdue" | "settled";
/** increase = lend more / borrow more; settle = collect / repay. */
export type DebtMovementKind = "increase" | "settle";

export interface LedgerTx {
  transaction_type: string;
  account_id: string;
  to_account_id: string | null;
  amount: number;
}

/** Signed effect of one transaction on the ledger balance (same rule as apply_transaction_balances). */
export function ledgerDelta(tx: LedgerTx, ledgerId: string): number {
  if (tx.transaction_type === "transfer" && tx.to_account_id === ledgerId) return tx.amount;
  if (tx.account_id !== ledgerId) return 0;
  return tx.transaction_type === "earning" ? tx.amount : -tx.amount;
}

export interface DebtTotals {
  total: number;       // opening + every increase
  settled: number;     // every payment / collection
  outstanding: number; // total − settled
}

export function summarizeDebt(
  direction: DebtDirection,
  openingAmount: number,
  ledgerId: string,
  txs: LedgerTx[]
): DebtTotals {
  let total = openingAmount;
  let settled = 0;
  for (const tx of txs) {
    const d = ledgerDelta(tx, ledgerId);
    const grows = direction === "receivable" ? d : -d; // > 0 = the debt grew
    if (grows > 0) total += grows;
    else settled -= grows;
  }
  return { total, settled, outstanding: total - settled };
}

/** today / dueDate are YYYY-MM-DD, so string compare is date compare. */
export function debtStatus(outstanding: number, dueDate: string | null, today: string): DebtStatus {
  if (Math.round(outstanding * 100) <= 0) return "settled";
  return dueDate && dueDate < today ? "overdue" : "open";
}

/** Lend and repay pay out of cash (cash → ledger); collect and borrow pay into cash (ledger → cash). */
export function movementLegs(
  direction: DebtDirection,
  kind: DebtMovementKind,
  ledgerId: string,
  cashId: string
): { account_id: string; to_account_id: string } {
  const cashPays = (direction === "receivable") === (kind === "increase");
  return cashPays
    ? { account_id: cashId, to_account_id: ledgerId }
    : { account_id: ledgerId, to_account_id: cashId };
}

export function ledgerDirection(isLiability: boolean): DebtDirection {
  return isLiability ? "payable" : "receivable";
}

/** Ledger balance as "amount owed" (positive = owed to me for AR, owed by me for AP). */
export function ledgerOwed(direction: DebtDirection, balance: number): number {
  return direction === "receivable" ? balance : -balance;
}

export type DebtTagError = "debtTransferOnly" | "debtGoalConflict" | "debtAccountMismatch";

/** A debt-tagged transaction must be a transfer that touches the debt's ledger and has no goal. */
export function checkDebtTag(
  tx: {
    transaction_type: string;
    account_id: string;
    to_account_id?: string | null;
    goal_id?: string | null;
  },
  ledgerId: string
): DebtTagError | null {
  if (tx.transaction_type !== "transfer") return "debtTransferOnly";
  if (tx.goal_id) return "debtGoalConflict";
  if (tx.account_id !== ledgerId && tx.to_account_id !== ledgerId) return "debtAccountMismatch";
  return null;
}
