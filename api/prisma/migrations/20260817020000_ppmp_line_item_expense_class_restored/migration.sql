-- Expense Class comes back as a real line-item field, positioned next to
-- Fund Source in the form — the `ExpenseClass` enum type itself was never
-- dropped (LineItem/UACSObject still use it), only this column was.
ALTER TABLE "ppmp_line_items"
  ADD COLUMN "expense_class" "ExpenseClass" NOT NULL DEFAULT 'MOOE';
