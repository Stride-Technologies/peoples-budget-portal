-- Phase 4 (NCPC endorser pivot, OD-2): endorsements are affirmative-only.
--
-- A ProgramEndorsement row's existence is the concurrence; there is no
-- pending/reject state (objections are ENDORSEMENT-stage comments). Drop the
-- now-constant `status` column and the EndorsementStatus enum. `endorsed_at` /
-- `endorsed_by_user_id` continue to record who concurred and when.
-- Hand-reviewed destructive migration.

ALTER TABLE "program_endorsements" DROP COLUMN "status";

DROP TYPE "EndorsementStatus";
