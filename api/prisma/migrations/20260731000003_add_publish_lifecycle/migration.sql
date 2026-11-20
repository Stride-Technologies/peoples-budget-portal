-- Phase 1 D8/D13 — the publish lifecycle.
-- See docs/design/phase-1-publish-scope.md §3.1-3.2.
--
-- Two new statuses; nothing is removed. The retained values still carry legacy
-- rows until the phase-7 migration empties them, and Phase 2 restores the gate
-- chain from archive/full-approval-workflow.

ALTER TYPE "ProgramStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "ProgramStatus" ADD VALUE 'PUBLISHED_REVISION';

ALTER TABLE "programs"
  ADD COLUMN "published_version_id" TEXT,
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "published_by_user_id" TEXT,
  -- Mirrors read by the public LIST query, so an open revision cannot leak a
  -- draft figure or a renamed program. The detail endpoints render the snapshot
  -- itself; see D13 for why the list is not moved onto jsonb.
  ADD COLUMN "published_name" TEXT,
  ADD COLUMN "published_proposed_total" DECIMAL(18,2);

-- SET NULL rather than CASCADE: losing a version row must not silently
-- unpublish a program from the public registry.
ALTER TABLE "programs" ADD CONSTRAINT "programs_published_version_id_fkey"
    FOREIGN KEY ("published_version_id") REFERENCES "program_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "programs_published_version_id_idx" ON "programs"("published_version_id");
