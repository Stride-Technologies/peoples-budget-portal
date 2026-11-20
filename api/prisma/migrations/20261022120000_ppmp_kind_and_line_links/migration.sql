-- specs/012 P5: a PPMP's kind (Indicative / Final) and optional line links to
-- the budget. Additive only: every column is nullable or defaulted, so the
-- running build keeps working while this applies.

-- CreateEnum
CREATE TYPE "PpmpKind" AS ENUM ('INDICATIVE', 'FINAL');

-- AlterTable: existing PPMPs are Indicative (made before any budget is enacted).
ALTER TABLE "ppmps"
  ADD COLUMN "kind" "PpmpKind" NOT NULL DEFAULT 'INDICATIVE',
  ADD COLUMN "source_ppmp_id" TEXT;

CREATE UNIQUE INDEX "ppmps_source_ppmp_id_key" ON "ppmps"("source_ppmp_id");

ALTER TABLE "ppmps" ADD CONSTRAINT "ppmps_source_ppmp_id_fkey"
  FOREIGN KEY ("source_ppmp_id") REFERENCES "ppmps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: at most one budget row per line.
ALTER TABLE "ppmp_line_items"
  ADD COLUMN "program_id" TEXT,
  ADD COLUMN "project_activity_id" TEXT,
  ADD COLUMN "budget_item_id" TEXT;

CREATE INDEX "ppmp_line_items_program_id_idx" ON "ppmp_line_items"("program_id");
CREATE INDEX "ppmp_line_items_project_activity_id_idx" ON "ppmp_line_items"("project_activity_id");
CREATE INDEX "ppmp_line_items_budget_item_id_idx" ON "ppmp_line_items"("budget_item_id");

ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_project_activity_id_fkey"
  FOREIGN KEY ("project_activity_id") REFERENCES "project_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_budget_item_id_fkey"
  FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_one_link"
  CHECK (num_nonnulls("program_id", "project_activity_id", "budget_item_id") <= 1);
