-- Phase 1 D3 — per-expense-class cost estimates on each PPA, and their
-- per-program rollups. See docs/design/phase-1-publish-scope.md §4.
--
-- Strictly additive. The line-item family (ps_total / mooe_total / co_total /
-- grand_total) is NOT touched: D4 makes non-breaking a hard requirement, and the
-- cost-assumptions feature that owns those columns arrives in a later phase.

ALTER TABLE "project_activities"
  ADD COLUMN "ps_estimate"   DECIMAL(18,2),
  ADD COLUMN "mooe_estimate" DECIMAL(18,2),
  ADD COLUMN "co_estimate"   DECIMAL(18,2);

ALTER TABLE "programs"
  ADD COLUMN "ps_proposed_total"   DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "mooe_proposed_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "co_proposed_total"   DECIMAL(18,2) NOT NULL DEFAULT 0;

-- No backfill. Existing rows carry a lump-sum proposed_budget with no expense
-- class attached, and guessing one would assert a breakdown nobody chose — MOOE
-- is simply wrong for a capital-outlay PPA. Those rows keep their manual
-- proposed_budget (§4.2 fallback) and stay publishable, because the publish gate
-- is proposed_budget > 0 rather than an estimate total (D19).
