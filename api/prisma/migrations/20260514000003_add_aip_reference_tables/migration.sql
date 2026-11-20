-- Add four AIP reference tables: PAPSector, UACSObject, ClimateTypologyCode, SGLGIndicator.
-- Adds ExpenseClass + ClimatePillar enums (ExpenseClass is reused later by LineItem in migration 7).

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "ExpenseClass"  AS ENUM ('PS', 'MOOE', 'CO');
CREATE TYPE "ClimatePillar" AS ENUM ('ADAPTATION', 'MITIGATION', 'CROSSCUTTING');

-- ─── PAPSector ────────────────────────────────────────────────────────────────
CREATE TABLE "pap_sectors" (
    "id"             TEXT          NOT NULL,
    "code"           TEXT          NOT NULL,
    "name"           TEXT          NOT NULL,
    "subsector_code" TEXT,
    "is_active"      BOOLEAN       NOT NULL DEFAULT true,
    "annex_source"   TEXT          DEFAULT 'BOM Annex 2',
    "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "pap_sectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pap_sectors_code_key" ON "pap_sectors"("code");

-- ─── UACSObject ───────────────────────────────────────────────────────────────
CREATE TABLE "uacs_objects" (
    "id"            TEXT           NOT NULL,
    "code"          TEXT           NOT NULL,
    "description"   TEXT           NOT NULL,
    "expense_class" "ExpenseClass" NOT NULL,
    "is_active"     BOOLEAN        NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "uacs_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uacs_objects_code_key" ON "uacs_objects"("code");

-- ─── ClimateTypologyCode ──────────────────────────────────────────────────────
CREATE TABLE "climate_typology_codes" (
    "id"          TEXT             NOT NULL,
    "code"        TEXT             NOT NULL,
    "pillar"      "ClimatePillar"  NOT NULL,
    "name"        TEXT             NOT NULL,
    "description" TEXT,
    "is_active"   BOOLEAN          NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "climate_typology_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "climate_typology_codes_code_key" ON "climate_typology_codes"("code");

-- ─── SGLGIndicator ────────────────────────────────────────────────────────────
CREATE TABLE "sglg_indicators" (
    "id"         TEXT          NOT NULL,
    "pillar"     TEXT          NOT NULL,
    "code"       TEXT          NOT NULL,
    "name"       TEXT          NOT NULL,
    "dilg_year"  INTEGER       NOT NULL,
    "is_active"  BOOLEAN       NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "sglg_indicators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sglg_indicators_code_key" ON "sglg_indicators"("code");
