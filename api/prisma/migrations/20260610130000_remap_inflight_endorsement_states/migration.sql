-- Phase 1 (NCPC endorser pivot): endorsement becomes non-blocking, so the
-- PENDING_ENDORSEMENT and ENDORSED workflow states are no longer produced.
--
-- Remap any IN-FLIGHT programs still parked in those states forward to
-- HEAD_REVIEWED so their owning HEAD can submit them for LFC approval under the
-- new single-gate flow (HEAD_REVIEWED -> PENDING_APPROVAL). Existing
-- ProgramEndorsement rows are retained as advisory historical records.
--
-- The ProgramStatus enum values themselves are KEPT for now and dropped only in
-- Phase 4, once no rows remain in either state (this migration guarantees that
-- for current data; new programs never enter them).
--
-- Data-only migration: no schema changes. Idempotent — re-running is a no-op
-- once no rows remain in the retired states.

UPDATE "programs"
SET "status" = 'HEAD_REVIEWED'
WHERE "status" IN ('PENDING_ENDORSEMENT', 'ENDORSED');
