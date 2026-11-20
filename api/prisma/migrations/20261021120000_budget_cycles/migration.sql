-- specs/012 P0 (expand only): a Budget Cycle per fiscal year, wrapping the
-- existing AIP cycle 1:1, and the ADOPTED status. Nothing is dropped and no
-- row's status changes: LOCKED rows stay LOCKED and every reader treats LOCKED
-- and ADOPTED alike, so the build still running during deploy keeps working.
-- The contract migration (P8) converts LOCKED rows and removes the value.

ALTER TYPE "AIPCycleStatus" ADD VALUE IF NOT EXISTS 'ADOPTED';

CREATE TABLE "budget_cycles" (
    "id" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "current_stage" INTEGER NOT NULL DEFAULT 0,
    "alongside_stages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_cycles_current_stage_range" CHECK ("current_stage" BETWEEN 0 AND 9),
    CONSTRAINT "budget_cycles_alongside_stages_range"
        CHECK ("alongside_stages" <@ ARRAY[0,1,2,3,4,5,6,7,8,9])
);

CREATE UNIQUE INDEX "budget_cycles_fiscal_year_key" ON "budget_cycles"("fiscal_year");

-- One Budget Cycle per existing AIP cycle, same id (public cycleIds and links
-- keep working). Stages copied from the hand-set LIVE_BUDGETS in
-- client/src/lib/budget-cycle.ts as of 2026-10-21; any other year is past
-- execution (9 = Accountability).
INSERT INTO "budget_cycles" ("id", "fiscal_year", "current_stage", "alongside_stages", "updated_at")
SELECT "id", "fiscal_year",
       CASE "fiscal_year" WHEN 2027 THEN 3 WHEN 2026 THEN 8 ELSE 9 END,
       CASE "fiscal_year" WHEN 2027 THEN ARRAY[1,2] WHEN 2026 THEN ARRAY[9] ELSE ARRAY[]::INTEGER[] END,
       CURRENT_TIMESTAMP
FROM "aip_cycles";

ALTER TABLE "aip_cycles" ADD COLUMN "budget_cycle_id" TEXT;
UPDATE "aip_cycles" SET "budget_cycle_id" = "id";
ALTER TABLE "aip_cycles" ALTER COLUMN "budget_cycle_id" SET NOT NULL;
CREATE UNIQUE INDEX "aip_cycles_budget_cycle_id_key" ON "aip_cycles"("budget_cycle_id");
ALTER TABLE "aip_cycles" ADD CONSTRAINT "aip_cycles_budget_cycle_id_fkey"
    FOREIGN KEY ("budget_cycle_id") REFERENCES "budget_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
