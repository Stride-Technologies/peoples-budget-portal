-- Phase 4 (NCPC endorser pivot): drop the retired CSO ceiling partition.
--
-- The LGU/CSO ceiling split stopped being applied in Phase 3 (the approval check
-- uses the single `total_ceiling`). With the NCPC proponent track gone, the
-- split columns and their enum are now unused — drop them. Hand-reviewed
-- destructive migration.

ALTER TABLE "finish_line_budget_ceilings"
  DROP COLUMN "cso_split_type",
  DROP COLUMN "cso_split_value";

ALTER TABLE "finish_line_budget_ceiling_history"
  DROP COLUMN "cso_split_type",
  DROP COLUMN "cso_split_value";

DROP TYPE "CSOSplitType";
