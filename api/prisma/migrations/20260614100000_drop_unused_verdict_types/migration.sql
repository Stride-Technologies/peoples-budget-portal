-- Phase 4 (NCPC endorser pivot): prune the unused VerdictType values.
--
-- The SUPER_ADMIN verdict path (INCREASE/DECREASE/REJECT) was removed in OD-3.
-- The sole remaining writer is ProgramWorkflowService.finalizeApproval, which
-- only ever records VerdictType.APPROVE. "Returned for revision" and "rejected"
-- are now ProgramStatus transitions (FOR_REVISION / REJECTED via the LFC
-- approval gate), not ProgramVerdict rows.
--
-- Recreate the enum (Postgres does not support ALTER TYPE ... DROP VALUE) with
-- APPROVE only. Hand-reviewed.
--
-- FAIL-SAFE BY DESIGN: this migration intentionally omits a remap. The
-- USING ("verdict"::text::"VerdictType") cast will ERROR if any program_verdicts
-- row still holds a legacy INCREASE/DECREASE/REJECT value, blocking the deploy
-- rather than silently rewriting audit history. The local DB has zero verdict
-- rows; any deployed environment that ran the pre-pivot verdict feature must be
-- inspected (and a conscious data decision made) before this can apply there.
--
-- Pre-flight: diagnose with
--   SELECT verdict::text, COUNT(*) FROM program_verdicts
--   WHERE verdict::text <> 'APPROVE' GROUP BY 1;
-- Remediate by deleting or archiving those rows before re-running.

DO $$
DECLARE
  legacy_count INT;
BEGIN
  SELECT COUNT(*) INTO legacy_count
    FROM "program_verdicts"
    WHERE "verdict"::text NOT IN ('APPROVE');
  IF legacy_count > 0 THEN
    RAISE EXCEPTION
      'VerdictType prune blocked: % row(s) in program_verdicts hold legacy values '
      '(INCREASE / DECREASE / REJECT). Inspect with: '
      'SELECT verdict::text, COUNT(*) FROM program_verdicts '
      'WHERE verdict::text <> ''APPROVE'' GROUP BY 1; '
      'Delete or archive those rows, then re-run the migration.',
      legacy_count;
  END IF;
END $$;

ALTER TYPE "VerdictType" RENAME TO "VerdictType_old";

CREATE TYPE "VerdictType" AS ENUM ('APPROVE');

ALTER TABLE "program_verdicts"
  ALTER COLUMN "verdict" TYPE "VerdictType" USING ("verdict"::text::"VerdictType");

DROP TYPE "VerdictType_old";
