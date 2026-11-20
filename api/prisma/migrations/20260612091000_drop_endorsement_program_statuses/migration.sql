-- Phase 4 (NCPC endorser pivot): retire the gated-endorsement program statuses.
--
-- Endorsement became non-blocking in Phase 1, so programs no longer enter
-- PENDING_ENDORSEMENT or ENDORSED — they go HEAD_REVIEWED → PENDING_APPROVAL.
-- The in-flight remap migration (20260610130000) already drained these states;
-- this re-remaps any straggler defensively, then recreates ProgramStatus without
-- the two values. REJECTED is kept (now sourced from the LFC reject action).
--
-- Recreate the enum (rather than ALTER TYPE ... DROP VALUE, which Postgres does
-- not support) in one transaction. Hand-reviewed.
-- Note: Prisma Migrate wraps every migration file in an implicit transaction, so
-- the UPDATE below and the enum recreation are already atomic — partial failure
-- rolls back both.

UPDATE "programs"
  SET "status" = 'HEAD_REVIEWED'
  WHERE "status" IN ('PENDING_ENDORSEMENT', 'ENDORSED');

ALTER TYPE "ProgramStatus" RENAME TO "ProgramStatus_old";

CREATE TYPE "ProgramStatus" AS ENUM (
  'DRAFT', 'FOR_REVISION', 'SUBMITTED', 'HEAD_REVIEWED',
  'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
);

ALTER TABLE "programs"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ProgramStatus" USING ("status"::text::"ProgramStatus"),
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ProgramStatus_old";
