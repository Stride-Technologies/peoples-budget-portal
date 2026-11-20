-- CreateEnum
CREATE TYPE "EndorserType" AS ENUM ('LGU', 'NCPC');

-- DropForeignKey
ALTER TABLE "program_endorsements" DROP CONSTRAINT "program_endorsements_endorser_city_office_id_fkey";

-- DropIndex
DROP INDEX "program_endorsements_program_version_id_endorser_city_offic_key";

-- AlterTable
ALTER TABLE "ncpc_users" ALTER COLUMN "civil_society_organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "program_endorsements" ADD COLUMN     "endorser_cso_id" TEXT,
ADD COLUMN     "endorser_type" "EndorserType" NOT NULL DEFAULT 'LGU',
ALTER COLUMN "endorser_city_office_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "program_endorsements_endorser_cso_id_idx" ON "program_endorsements"("endorser_cso_id");

-- AddForeignKey
ALTER TABLE "program_endorsements" ADD CONSTRAINT "program_endorsements_endorser_city_office_id_fkey" FOREIGN KEY ("endorser_city_office_id") REFERENCES "city_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_endorsements" ADD CONSTRAINT "program_endorsements_endorser_cso_id_fkey" FOREIGN KEY ("endorser_cso_id") REFERENCES "civil_society_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hand-reviewed: per-type uniqueness + shape integrity ───────────────────
-- One endorsement per endorser per program version, scoped by endorser type.
-- Prisma's @@unique cannot express partial (WHERE-filtered) unique indexes, so
-- they are declared here directly.

-- LGU: one row per (version, city office).
CREATE UNIQUE INDEX "program_endorsements_lgu_unique"
  ON "program_endorsements" ("program_version_id", "endorser_city_office_id")
  WHERE "endorser_type" = 'LGU';

-- NCPC umbrella head (no CSO): one row per version.
CREATE UNIQUE INDEX "program_endorsements_ncpc_umbrella_unique"
  ON "program_endorsements" ("program_version_id")
  WHERE "endorser_type" = 'NCPC' AND "endorser_cso_id" IS NULL;

-- NCPC CSO representative: one row per (version, CSO).
CREATE UNIQUE INDEX "program_endorsements_ncpc_cso_unique"
  ON "program_endorsements" ("program_version_id", "endorser_cso_id")
  WHERE "endorser_type" = 'NCPC' AND "endorser_cso_id" IS NOT NULL;

-- Shape integrity: the right FK(s) are set for each endorser type.
--   LGU  → city office set, CSO null
--   NCPC → city office null (CSO null = umbrella head, CSO set = representative)
-- Composite lookup index for "all endorsements for a version, by type".
-- The partial unique indexes above cover uniqueness but not general scans.
CREATE INDEX "program_endorsements_version_type_idx"
  ON "program_endorsements" ("program_version_id", "endorser_type");

ALTER TABLE "program_endorsements"
  ADD CONSTRAINT "program_endorsements_endorser_shape_check" CHECK (
    ("endorser_type" = 'LGU'
       AND "endorser_city_office_id" IS NOT NULL
       AND "endorser_cso_id" IS NULL)
    OR
    ("endorser_type" = 'NCPC'
       AND "endorser_city_office_id" IS NULL)
  );
