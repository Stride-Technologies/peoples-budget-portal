-- Add proposed_total to programs: sum of root PA proposedBudget values.
-- Used as the secondary sort key for "Highest Budget" when grandTotal is zero
-- (i.e. programs that have a proposed amount but no itemized line items yet).
ALTER TABLE "programs" ADD COLUMN "proposed_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Backfill existing rows
UPDATE "programs" p
SET "proposed_total" = COALESCE((
  SELECT SUM(pa.proposed_budget)
  FROM project_activities pa
  WHERE pa.program_id = p.id
    AND pa.parent_project_activity_id IS NULL
), 0);
