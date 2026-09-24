import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format");

export const debtDirectionSchema = z.enum(["receivable", "payable"]);

export const createDebtSchema = z.object({
  direction: debtDirectionSchema,
  counterparty: z.string().trim().min(1, "Counterparty is required").max(100),
  account_id: z.string().uuid("Invalid account ID"), // ledger
  amount: z.number().positive("Amount must be greater than 0"),
  due_date: dateStr.optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
  // Set → money moves now (tagged transfer from/to this account). Null → amount is already in the ledger (opening_amount).
  cash_account_id: z.string().uuid("Invalid account ID").optional().nullable(),
  transaction_date: dateStr,
});

export const updateDebtSchema = z
  .object({
    counterparty: z.string().trim().min(1, "Counterparty is required").max(100),
    opening_amount: z.number().min(0, "Amount cannot be negative"),
    due_date: dateStr.nullable(),
    note: z.string().trim().max(200).nullable(),
  })
  .partial();

export const debtMovementSchema = z.object({
  debt_id: z.string().uuid("Invalid debt ID"),
  kind: z.enum(["increase", "settle"]),
  cash_account_id: z.string().uuid("Invalid account ID"),
  amount: z.number().positive("Amount must be greater than 0"),
  transaction_date: dateStr,
  note: z.string().trim().max(200).optional().nullable(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type DebtMovementInput = z.infer<typeof debtMovementSchema>;
