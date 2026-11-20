-- Phase 2 (NCPC endorser pivot): split the LFC member-office decision into a
-- recoverable RETURNED (program → FOR_REVISION) and a terminal REJECTED
-- (program → REJECTED). Under the old model the single REJECTED value meant
-- "returned for revision", so every existing REJECTED approval row backfills to
-- RETURNED; the new terminal REJECTED starts empty.
--
-- Recreate the enum in one transaction rather than `ALTER TYPE ... ADD VALUE`
-- plus a separate backfill: Postgres forbids using a newly added enum value in
-- the same transaction that adds it, so the recreate is the clean, atomic path.

ALTER TYPE "ApprovalStatus" RENAME TO "ApprovalStatus_old";

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'REJECTED');

ALTER TABLE "program_approvals"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ApprovalStatus" USING (
    CASE "status"::text
      WHEN 'REJECTED' THEN 'RETURNED'
      ELSE "status"::text
    END::"ApprovalStatus"
  ),
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "ApprovalStatus_old";
