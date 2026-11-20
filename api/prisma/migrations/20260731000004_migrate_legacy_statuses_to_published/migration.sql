-- Phase 7 (D14) — empty the legacy statuses instead of carrying them.
-- See docs/design/phase-1-publish-scope.md §3.5.
--
-- VALIDATED against a scratch Postgres (2026-07-31) with fixtures covering:
--   * SUBMITTED with two versions      → PUBLISHED on the LATEST version
--   * APPROVED with a final code       → PUBLISHED, code NOT reassigned
--   * SUBMITTED with no snapshot       → DRAFT (never a blank public page)
--   * already DRAFT                    → untouched
--   * soft-deleted SUBMITTED           → excluded entirely
-- All three post-conditions passed, and a second run was a no-op (idempotent).
--
-- ⚠️ STILL RUN THE VERIFICATION BLOCK AGAINST PRODUCTION FIRST. What the scratch
-- run cannot tell you: how many rows are actually in each status, and whether
-- every SUBMITTED program really does have a snapshot. Those are assumptions
-- taken from the design session ("in the live data, all are under submitted
-- state") — the queries below check them.
--
-- Why migrate rather than retain: a program left at SUBMITTED after phase 6 is a
-- zombie — not in EDITABLE_PROGRAM_STATUSES, and every route that could advance
-- it has been deleted. A program left at PENDING_APPROVAL stays publicly visible
-- but has no published_version_id, so the public detail page has no snapshot to
-- render. Emptying the legacy states is also what lets the public predicate be
-- exactly `published_version_id IS NOT NULL` with no legacy OR clause.

-- ── Verification (run manually first; these are comments, not executed) ──────
--   SELECT status, COUNT(*) FROM programs WHERE deleted_at IS NULL GROUP BY status;
--   -- Expected: SUBMITTED = all rows, everything else 0.
--
--   SELECT COUNT(*) FROM programs p
--   WHERE p.deleted_at IS NULL
--     AND p.status = 'SUBMITTED'
--     AND NOT EXISTS (SELECT 1 FROM program_versions v WHERE v.program_id = p.id);
--   -- Expected: 0. Submitted programs get a v1 snapshot from snapshotOnSubmit
--   -- (see commit 6e7727b for the seeded ones). Any row here would migrate to
--   -- PUBLISHED with a NULL published_version_id and vanish from the public
--   -- registry, so this must be zero before proceeding.

-- ── SUBMITTED / HEAD_REVIEWED / PENDING_APPROVAL / APPROVED → PUBLISHED ──────
-- Point published_version_id at the program's latest existing snapshot and
-- backfill the publish metadata from that version's own submission record.
WITH latest AS (
  SELECT DISTINCT ON (v.program_id)
    v.program_id,
    v.id            AS version_id,
    v.submitted_at,
    v.submitted_by_user_id
  FROM program_versions v
  ORDER BY v.program_id, v.version DESC
)
UPDATE programs p
SET status                   = 'PUBLISHED',
    published_version_id     = latest.version_id,
    published_at             = latest.submitted_at,
    published_by_user_id     = latest.submitted_by_user_id,
    published_name           = p.name,
    published_proposed_total = p.proposed_total
FROM latest
WHERE latest.program_id = p.id
  AND p.deleted_at IS NULL
  AND p.status IN ('SUBMITTED', 'HEAD_REVIEWED', 'PENDING_APPROVAL', 'APPROVED');

-- Deliberately NOT touched: aip_reference_code. A final code already assigned by
-- the LFC path must never be reissued, and issuing new ones needs the code
-- format's five segments and per-scope counters — logic that already exists and
-- is tested in AIPCodesService, and would have to be duplicated here to work in
-- SQL. Run `prisma/backfill-final-aip-codes.ts` after this migration instead.

-- ── Anything left with no snapshot falls back to DRAFT ──────────────────────
-- Not public today, so nothing regresses, and it lands back in the encoder's
-- work queue where Phase 1 wants it. Also catches HEAD_REVIEWED rows that never
-- produced a version.
UPDATE programs
SET status = 'DRAFT'
WHERE deleted_at IS NULL
  AND status IN ('SUBMITTED', 'HEAD_REVIEWED')
  AND published_version_id IS NULL;

-- FOR_REVISION, REJECTED, and DRAFT are left exactly as they are.

-- ── Post-conditions (run manually) ──────────────────────────────────────────
--   SELECT status, COUNT(*) FROM programs WHERE deleted_at IS NULL GROUP BY status;
--   -- Expected: only DRAFT / FOR_REVISION / REJECTED / PUBLISHED remain.
--
--   SELECT COUNT(*) FROM programs
--   WHERE status = 'PUBLISHED' AND published_version_id IS NULL;
--   -- Expected: 0. A PUBLISHED program with no snapshot renders a blank public
--   -- detail page.
