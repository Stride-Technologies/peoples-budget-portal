-- Program model: AIP entry, parent of ProjectActivity. Polymorphic proponent (LGU XOR NCPC).

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "ProponentType" AS ENUM ('LGU', 'NCPC');
CREATE TYPE "ProgramStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'HEAD_REVIEWED',
    'ENDORSED',
    'APPROVED',
    'REJECTED'
);

-- ─── programs table ───────────────────────────────────────────────────────────
CREATE TABLE "programs" (
    "id"                              TEXT             NOT NULL,
    "aip_cycle_id"                    TEXT             NOT NULL,

    "proponent_type"                  "ProponentType"  NOT NULL,
    "city_office_id"                  TEXT,
    "civil_society_organization_id"   TEXT,

    "pap_sector_id"                   TEXT             NOT NULL,
    "pap_subsector_code"              TEXT             NOT NULL DEFAULT '000',

    "finish_line_id"                  TEXT             NOT NULL,
    "sglg_indicator_id"               TEXT,

    "name"                            TEXT             NOT NULL,
    "description"                     TEXT,
    "expected_output"                 TEXT             NOT NULL,

    "tentative_aip_reference_code"    TEXT             NOT NULL,
    "aip_reference_code"              TEXT,

    "status"                          "ProgramStatus"  NOT NULL DEFAULT 'DRAFT',
    "rejection_reason"                TEXT,
    "current_version"                 INTEGER          NOT NULL DEFAULT 0,

    "ps_total"                        DECIMAL(18, 2)   NOT NULL DEFAULT 0,
    "mooe_total"                      DECIMAL(18, 2)   NOT NULL DEFAULT 0,
    "co_total"                        DECIMAL(18, 2)   NOT NULL DEFAULT 0,
    "grand_total"                     DECIMAL(18, 2)   NOT NULL DEFAULT 0,

    "created_by_user_id"              TEXT             NOT NULL,
    "created_at"                      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                      TIMESTAMP(3)     NOT NULL,
    "deleted_at"                      TIMESTAMP(3),

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- ─── Unique indexes ───────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "programs_tentative_aip_reference_code_key" ON "programs"("tentative_aip_reference_code");
CREATE UNIQUE INDEX "programs_aip_reference_code_key"           ON "programs"("aip_reference_code");

-- ─── Lookup indexes ───────────────────────────────────────────────────────────
CREATE INDEX "programs_aip_cycle_id_status_idx"                   ON "programs"("aip_cycle_id", "status");
CREATE INDEX "programs_aip_cycle_id_proponent_type_idx"           ON "programs"("aip_cycle_id", "proponent_type");
CREATE INDEX "programs_finish_line_id_idx"                        ON "programs"("finish_line_id");
CREATE INDEX "programs_city_office_id_idx"                        ON "programs"("city_office_id");
CREATE INDEX "programs_civil_society_organization_id_idx"         ON "programs"("civil_society_organization_id");

-- ─── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "programs"
    ADD CONSTRAINT "programs_aip_cycle_id_fkey"
    FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_city_office_id_fkey"
    FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_civil_society_organization_id_fkey"
    FOREIGN KEY ("civil_society_organization_id") REFERENCES "civil_society_organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_pap_sector_id_fkey"
    FOREIGN KEY ("pap_sector_id") REFERENCES "pap_sectors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_finish_line_id_fkey"
    FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_sglg_indicator_id_fkey"
    FOREIGN KEY ("sglg_indicator_id") REFERENCES "sglg_indicators"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Proponent XOR check constraint ───────────────────────────────────────────
ALTER TABLE "programs"
    ADD CONSTRAINT "programs_proponent_xor_chk"
    CHECK (
        ("proponent_type" = 'LGU'
            AND "city_office_id" IS NOT NULL
            AND "civil_society_organization_id" IS NULL)
        OR
        ("proponent_type" = 'NCPC'
            AND "civil_society_organization_id" IS NOT NULL
            AND "city_office_id" IS NULL)
    );
