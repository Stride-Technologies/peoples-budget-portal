-- Lets a Program carry its own money instead of deriving it from its PPAs.
--
-- Both columns are additive with defaults, so every existing row keeps exactly
-- the behaviour it had: `ACTIVITY_CHILDREN` means "derive from what is under
-- me", which is what `EstimateRollupService.recomputeProgram` has always done.
-- Nothing is backfilled and no amount moves.
--
-- The default differs from `project_activities.cost_mode` (DIRECT_COSTS) on
-- purpose: a PA is usually a leaf, a Program usually has PPAs.
ALTER TABLE "programs"
  ADD COLUMN "cost_mode" "PPACostMode" NOT NULL DEFAULT 'ACTIVITY_CHILDREN',
  ADD COLUMN "fund_sources" "FundSource"[] DEFAULT ARRAY[]::"FundSource"[];
