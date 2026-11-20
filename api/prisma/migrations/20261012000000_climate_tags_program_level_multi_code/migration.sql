-- Climate tags on a program or a PPA, carrying any number of CCET codes.
--
-- The FY2027 pre-final AIP tags programs that state their own costs (ENRO
-- `10. Mt. Isarog…`) and parent rows (HSDO `11.`), lists two codes on one row
-- (CAgO "M114-04, M114-01"), and has rows with a climate amount but no code
-- yet (HSDO). A tag therefore:
--   - belongs to exactly one of a project activity or a program (CHECK below);
--   - holds its codes in a join table, 0..n of them.
--
-- Existing tags keep their single code: it is copied into the join table
-- before the column is dropped. No tag moves owner and no amount changes.

-- 1. Owner: PPA or program.
ALTER TABLE "climate_change_tags" ALTER COLUMN "project_activity_id" DROP NOT NULL;
ALTER TABLE "climate_change_tags" ADD COLUMN "program_id" TEXT;
CREATE UNIQUE INDEX "climate_change_tags_program_id_key" ON "climate_change_tags"("program_id");
ALTER TABLE "climate_change_tags"
  ADD CONSTRAINT "climate_change_tags_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "climate_change_tags"
  ADD CONSTRAINT "climate_change_tags_one_owner"
  CHECK (("project_activity_id" IS NULL) <> ("program_id" IS NULL));

-- 2. Codes: 0..n per tag.
CREATE TABLE "climate_change_tag_codes" (
    "tag_id" TEXT NOT NULL,
    "ccet_code_id" TEXT NOT NULL,
    CONSTRAINT "climate_change_tag_codes_pkey" PRIMARY KEY ("tag_id", "ccet_code_id")
);
CREATE INDEX "climate_change_tag_codes_ccet_code_id_idx" ON "climate_change_tag_codes"("ccet_code_id");
ALTER TABLE "climate_change_tag_codes"
  ADD CONSTRAINT "climate_change_tag_codes_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "climate_change_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "climate_change_tag_codes"
  ADD CONSTRAINT "climate_change_tag_codes_ccet_code_id_fkey"
  FOREIGN KEY ("ccet_code_id") REFERENCES "climate_typology_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "climate_change_tag_codes" ("tag_id", "ccet_code_id")
SELECT "id", "ccet_code_id" FROM "climate_change_tags" WHERE "ccet_code_id" IS NOT NULL;

ALTER TABLE "climate_change_tags" DROP CONSTRAINT "climate_change_tags_ccet_code_id_fkey";
DROP INDEX IF EXISTS "climate_change_tags_ccet_code_id_idx";
ALTER TABLE "climate_change_tags" DROP COLUMN "ccet_code_id";
