-- Backfill the two fields added in 20260804000000 on rows that predate them.
--
-- That migration deliberately left them blank rather than guess. The budget
-- office has since confirmed the answer for the existing catalog: every current
-- program is Operations, and every current PPA draws on the General Fund. So
-- the values stop being an export-time fallback and become real data.
--
-- Behaviour-neutral for the export — `papClass ?? OPERATIONS` and the empty
-- `fundSources` → `GF` fallback already printed exactly this. What changes is
-- that the rows now say so themselves, so anything reading the columns
-- directly (filters, reports, the UI's edit forms) sees the same answer the
-- sheet does.
--
-- Both statements are guarded and therefore idempotent: re-running touches
-- nothing, and a row an office has already classified is left alone.

UPDATE "programs"
   SET "pap_class" = 'OPERATIONS'
 WHERE "pap_class" IS NULL;

UPDATE "project_activities"
   SET "fund_sources" = ARRAY['GF']::"FundSource"[]
 WHERE "fund_sources" IS NULL
    OR cardinality("fund_sources") = 0;
