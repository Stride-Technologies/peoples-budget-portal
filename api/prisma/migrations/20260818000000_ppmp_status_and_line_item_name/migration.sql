-- Two-state approval gate: DRAFT (default) / APPROVED. Publish now requires
-- APPROVED; editing an APPROVED Project reverts it to DRAFT.
CREATE TYPE "PpmpStatus" AS ENUM ('DRAFT', 'APPROVED');

ALTER TABLE "ppmps"
  ADD COLUMN "status" "PpmpStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approved_at" TIMESTAMP(3);

-- Backfill: a Project that is already published must have been approved to
-- get there under the new rule, so treat it as APPROVED rather than
-- silently demoting it to a state where it can no longer be republished
-- without an explicit re-approval it never needed before this migration.
UPDATE "ppmps"
  SET "status" = 'APPROVED', "approved_at" = COALESCE("published_at", now())
  WHERE "is_published" = true;

-- PPMPLineItem.projectName -> lineItemName: "Project" is the PPMP itself
-- (named from its Program); this field describes one procurement item
-- under it, so reusing "Project Name" here was actively confusing.
ALTER TABLE "ppmp_line_items"
  RENAME COLUMN "project_name" TO "line_item_name";
