-- AlterEnum
ALTER TYPE "ProgramStatus" ADD VALUE 'PENDING_ENDORSEMENT';

-- Migrate existing HEAD_REVIEWED programs to PENDING_ENDORSEMENT.
-- These already have ProgramEndorsement rows created by the old markHeadReviewed()
-- code, so their endorsement rows are preserved.
UPDATE programs
SET status = 'PENDING_ENDORSEMENT'
WHERE status = 'HEAD_REVIEWED';
