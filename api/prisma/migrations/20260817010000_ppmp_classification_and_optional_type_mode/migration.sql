-- A Project's own classification (General Administrative Services / Support
-- to Operations / Operations / Digitalization) — separate from AIP's
-- PapClass enum, since Digitalization has no AIP-code-segment equivalent.
CREATE TYPE "PpmpClassification" AS ENUM (
  'GENERAL_ADMINISTRATIVE_SERVICES',
  'SUPPORT_TO_OPERATIONS',
  'OPERATIONS',
  'DIGITALIZATION'
);

ALTER TABLE "ppmps"
  ADD COLUMN "classification" "PpmpClassification" NOT NULL DEFAULT 'OPERATIONS';

-- Type of Project / Recommended Mode of Procurement become optional on the
-- line-item form — offices don't always have these decided up front.
ALTER TABLE "ppmp_line_items"
  ALTER COLUMN "type_of_project" DROP NOT NULL,
  ALTER COLUMN "mode_of_procurement" DROP NOT NULL;

-- Expense Class is removed entirely, not just hidden in the form — it never
-- had a real requirement behind it on the line-item form.
ALTER TABLE "ppmp_line_items"
  DROP COLUMN "expense_class";

-- Expected Delivery/Implementation Period collapses to one free-text field,
-- not a start/end pair.
ALTER TABLE "ppmp_line_items"
  DROP COLUMN "delivery_start",
  DROP COLUMN "delivery_end",
  ADD COLUMN "delivery_period" TEXT;
