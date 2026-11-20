-- Combined migration: create DBMOffice + OfficeType enum, add FK + canEndorse to CityOffice,
-- add code + canEndorse to CivilSocietyOrganization. (Plan migrations 2 + 3 merged because
-- Prisma requires both sides of the DBMOffice <-> CityOffice relation in one schema state.)

-- ─── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "OfficeType" AS ENUM ('MANDATORY', 'OPTIONAL', 'OTHERS');

-- ─── DBMOffice table ──────────────────────────────────────────────────────────
CREATE TABLE "dbm_offices" (
    "id"           TEXT          NOT NULL,
    "code"         TEXT          NOT NULL,
    "name"         TEXT          NOT NULL,
    "office_type"  "OfficeType"  NOT NULL,
    "annex_source" TEXT          DEFAULT 'BOM Annex D',
    "is_active"    BOOLEAN       NOT NULL DEFAULT true,
    "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "dbm_offices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dbm_offices_code_key" ON "dbm_offices"("code");

-- ─── CityOffice additions ─────────────────────────────────────────────────────
ALTER TABLE "city_offices"
    ADD COLUMN "can_endorse"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "dbm_office_id" TEXT;

ALTER TABLE "city_offices"
    ADD CONSTRAINT "city_offices_dbm_office_id_fkey"
    FOREIGN KEY ("dbm_office_id") REFERENCES "dbm_offices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── CivilSocietyOrganization additions ───────────────────────────────────────
ALTER TABLE "civil_society_organizations"
    ADD COLUMN "code"        TEXT,
    ADD COLUMN "can_endorse" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "civil_society_organizations_code_key" ON "civil_society_organizations"("code");
