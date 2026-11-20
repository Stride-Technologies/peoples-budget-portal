-- Expected Delivery/Implementation Period becomes free text, not a
-- structured month/year picker (offices write things like "within 30 days
-- of PO" that don't fit a date range). Procurement Activity dates are
-- unaffected — they stay structured month/year ints.
ALTER TABLE "ppmp_line_items"
  DROP COLUMN "delivery_start_month",
  DROP COLUMN "delivery_start_year",
  DROP COLUMN "delivery_end_month",
  DROP COLUMN "delivery_end_year",
  ADD COLUMN "delivery_start" TEXT,
  ADD COLUMN "delivery_end" TEXT;
