import { z } from "zod";

export const transactionTypeSchema = z.enum(["spending", "earning", "transfer"]);

export const createTransactionSchema = z.object({
  account_id: z.string().uuid("Invalid account ID"),
  to_account_id: z.string().uuid("Invalid destination account ID").optional().nullable(),
  transaction_type: transactionTypeSchema,
  amount: z.number().positive("Amount must be greater than 0"),
  note: z.string().min(1, "Note is required"),
  category_id: z.string().uuid().optional().nullable(),
  goal_id: z.string().uuid().optional().nullable(),
  debt_id: z.string().uuid().optional().nullable(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  // to_account_id bisa di-unset (null) saat ganti tipe dari transfer
  to_account_id: z.string().uuid().optional().nullable(),
  goal_id: z.string().uuid().optional().nullable(),
  debt_id: z.string().uuid().optional().nullable(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
