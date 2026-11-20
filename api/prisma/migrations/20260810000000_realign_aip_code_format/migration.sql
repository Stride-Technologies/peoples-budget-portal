-- Realign the AIP reference code to the format the city actually prints, and
-- add the columns the printed Annual Budget sheet needs.
--
-- Old:  {sector4}-{subsector3}-{lguLevel1}-{officeType1}-{officeCode3}-{prog3}-{pa3}
-- New:  {sector4}-{lguLevel1}-{officeType2}-{officeCode}-{papClass3}-{prog3}-{pa3}
--
-- Two consequences drive everything below:
--
--   1. The program ordinal now restarts inside each papClass (GAS 001…, STO
--      001…, Operations 001…), so restating existing codes is a **re-rank**,
--      not a reformat. Digits move, so it cannot be done in SQL — it needs the
--      rank the service computes. `prisma/restate-aip-codes.ts` does it, and
--      must be run immediately after this migration.
--
--   2. The code carries no year segment, so every fiscal year reissues the same
--      strings. The global unique indexes only survived while one cycle had
--      volume; loading AB 2026 alongside 2027 breaks them. They become
--      per-cycle (programs) and per-program (project activities).

-- ─── Pre-flight ──────────────────────────────────────────────────────────────
-- An office with no code or type cannot produce a code at all, and the
-- restatement that follows would skip its programs silently. Fail here instead.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM programs p
    JOIN offices o ON o.id = p.office_id
   WHERE p.deleted_at IS NULL
     AND (o.office_code IS NULL OR o.office_type IS NULL);
  IF n > 0 THEN
    RAISE EXCEPTION
      '% live program(s) belong to an office with no office_code/office_type; set both in the control panel before realigning codes', n;
  END IF;
END $$;

-- ─── New columns: the printed sheet's three text columns ─────────────────────
-- `expected_output` is reinterpreted as the Performance Indicator column; it is
-- not moved, only relabelled in the UI. These two are the other columns the
-- template needs and nothing in the schema had a home for.
ALTER TABLE "programs"
  ADD COLUMN "major_final_output"     TEXT,
  ADD COLUMN "target_for_budget_year" TEXT;

ALTER TABLE "project_activities"
  ADD COLUMN "major_final_output"     TEXT,
  ADD COLUMN "target_for_budget_year" TEXT;

-- ─── Component programs ──────────────────────────────────────────────────────
-- The office whose printed sheet this program appears under, in that sheet's
-- COMPONENT PROGRAMS band. Not a code segment: a component program's code names
-- its own office, exactly as the city's book does.
ALTER TABLE "programs" ADD COLUMN "host_office_id" TEXT;

ALTER TABLE "programs"
  ADD CONSTRAINT "programs_host_office_id_fkey"
  FOREIGN KEY ("host_office_id") REFERENCES "offices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "programs_host_office_id_idx" ON "programs"("host_office_id");

-- ─── Office header block ─────────────────────────────────────────────────────
-- The four fields that head every AB sheet. All optional — the city leaves
-- Vision and Mission blank on several sheets.
ALTER TABLE "offices"
  ADD COLUMN "mandate_legal_basis"     TEXT,
  ADD COLUMN "vision"                  TEXT,
  ADD COLUMN "mission"                 TEXT,
  ADD COLUMN "organizational_outcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ─── Code uniqueness: global → scoped ────────────────────────────────────────
-- Strictly weaker constraints, so nothing can violate them on the way in.
--
-- Programs scope to the cycle. Project activities scope to the program instead:
-- a PA code embeds its program's code, so two PAs can only ever collide inside
-- one program — which is exactly the resync bug the constraint exists to catch,
-- and what the two-pass `~{id}` sentinel write is dodging.
DROP INDEX "programs_tentative_aip_reference_code_key";
DROP INDEX "programs_aip_reference_code_key";
CREATE UNIQUE INDEX "programs_aip_cycle_id_tentative_aip_reference_code_key"
  ON "programs"("aip_cycle_id", "tentative_aip_reference_code");
CREATE UNIQUE INDEX "programs_aip_cycle_id_aip_reference_code_key"
  ON "programs"("aip_cycle_id", "aip_reference_code");

DROP INDEX "project_activities_tentative_aip_reference_code_key";
DROP INDEX "project_activities_aip_reference_code_key";
CREATE UNIQUE INDEX "project_activities_program_id_tentative_aip_reference_code_key"
  ON "project_activities"("program_id", "tentative_aip_reference_code");
CREATE UNIQUE INDEX "project_activities_program_id_aip_reference_code_key"
  ON "project_activities"("program_id", "aip_reference_code");

-- ─── The code scope gains papClass ───────────────────────────────────────────
-- The resync reads siblings by (cycle, office, sector) ordered by papClass then
-- orderIndex, and now buckets the ordinal by papClass too.
-- Name is Prisma's own, already shortened to fit Postgres's 63-byte identifier
-- limit. Spelling it any other way lets Postgres truncate it to something the
-- schema no longer matches, and every later `migrate diff` reports drift.
DROP INDEX "programs_aip_cycle_id_office_id_pap_sector_id_order_index_idx";
CREATE INDEX "programs_aip_cycle_id_office_id_pap_sector_id_pap_class_ord_idx"
  ON "programs"("aip_cycle_id", "office_id", "pap_sector_id", "pap_class", "order_index");

-- ─── Counters ────────────────────────────────────────────────────────────────
-- Final-code counter scope keys gain the papClass segment, so the old keys
-- (`{cycle}:LGU:{office}:{sector}:final`) no longer match anything the service
-- asks for. Delete them rather than leaving rows nothing reads — the
-- restatement re-issues every final code and seeds the new keys as it goes.
--
-- The `:tentative` keys have been dead since codes became derived; this clears
-- those too.
DELETE FROM "aip_code_counters"
 WHERE "scope_key" LIKE '%:tentative'
    OR "scope_key" ~ '^[^:]+:LGU:[^:]+:[^:]+:final$';
