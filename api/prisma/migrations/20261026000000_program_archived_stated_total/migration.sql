-- specs/013: an ARCHIVED program status, and the total an enacted ordinance states.

-- AlterEnum
ALTER TYPE "ProgramStatus" ADD VALUE 'ARCHIVED';

-- AlterEnum
ALTER TYPE "ProgramAuditAction" ADD VALUE 'ARCHIVED';
ALTER TYPE "ProgramAuditAction" ADD VALUE 'UNARCHIVED';

-- AlterTable
ALTER TABLE "programs" ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "archived_reason" TEXT;

-- AlterTable
ALTER TABLE "budget_cycles" ADD COLUMN "stated_total" DECIMAL(18,2),
ADD COLUMN "stated_office_total" DECIMAL(18,2),
ADD COLUMN "stated_special_total" DECIMAL(18,2),
ADD COLUMN "stated_source" TEXT;

-- The parts are both absent, or both present and add up to the total.
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_stated_parts_check" CHECK (
  (stated_office_total IS NULL AND stated_special_total IS NULL)
  OR (stated_total IS NOT NULL
      AND stated_office_total IS NOT NULL
      AND stated_special_total IS NOT NULL
      AND stated_office_total + stated_special_total = stated_total)
);

-- FY2026, from Ord. 2025-131's recap GRAND TOTAL (public record). Office
-- appropriations (38 sheets) + Special Purpose Appropriations, which already
-- contain LDF and LDRRMF — see docs/design/ab-2026-verification-report.md.
UPDATE "budget_cycles"
SET "stated_total" = 2122357059.00,
    "stated_office_total" = 1664699680.00,
    "stated_special_total" = 457657379.00,
    "stated_source" = 'Ord. 2025-131'
WHERE "fiscal_year" = 2026;
