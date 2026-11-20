-- ProjectActivity (children of Program), LineItem (budget rows), ClimateChangeTag (1:1 with PA).

-- ─── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "PPAType" AS ENUM ('PROJECT', 'ACTIVITY');

-- ─── project_activities ───────────────────────────────────────────────────────
CREATE TABLE "project_activities" (
    "id"                              TEXT           NOT NULL,
    "program_id"                      TEXT           NOT NULL,
    "parent_project_activity_id"      TEXT,
    "type"                            "PPAType"      NOT NULL,
    "name"                            TEXT           NOT NULL,
    "description"                     TEXT,
    "expected_output"                 TEXT           NOT NULL,

    "tentative_aip_reference_code"    TEXT           NOT NULL,
    "aip_reference_code"              TEXT,

    "order_index"                     INTEGER        NOT NULL DEFAULT 0,

    "ps_total"                        DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "mooe_total"                      DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "co_total"                        DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "grand_total"                     DECIMAL(18, 2) NOT NULL DEFAULT 0,

    "created_by_user_id"              TEXT           NOT NULL,
    "created_at"                      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                      TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_activities_tentative_aip_reference_code_key" ON "project_activities"("tentative_aip_reference_code");
CREATE UNIQUE INDEX "project_activities_aip_reference_code_key"           ON "project_activities"("aip_reference_code");
CREATE INDEX        "project_activities_program_id_idx"                   ON "project_activities"("program_id");
CREATE INDEX        "project_activities_parent_project_activity_id_idx"   ON "project_activities"("parent_project_activity_id");

ALTER TABLE "project_activities"
    ADD CONSTRAINT "project_activities_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_activities"
    ADD CONSTRAINT "project_activities_parent_project_activity_id_fkey"
    FOREIGN KEY ("parent_project_activity_id") REFERENCES "project_activities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── line_items ───────────────────────────────────────────────────────────────
CREATE TABLE "line_items" (
    "id"                   TEXT            NOT NULL,
    "project_activity_id"  TEXT            NOT NULL,
    "expense_class"        "ExpenseClass"  NOT NULL,
    "uacs_object_id"       TEXT            NOT NULL,
    "uacs_code"            TEXT            NOT NULL,
    "uacs_description"     TEXT            NOT NULL,
    "quantity"             DECIMAL(14, 2)  NOT NULL,
    "unit"                 TEXT            NOT NULL,
    "unit_cost"            DECIMAL(18, 2)  NOT NULL,
    "line_total"           DECIMAL(18, 2)  NOT NULL,
    "remarks"              TEXT,
    "order_index"          INTEGER         NOT NULL DEFAULT 0,
    "created_at"           TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "line_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "line_items_project_activity_id_idx" ON "line_items"("project_activity_id");
CREATE INDEX "line_items_uacs_object_id_idx"      ON "line_items"("uacs_object_id");

ALTER TABLE "line_items"
    ADD CONSTRAINT "line_items_project_activity_id_fkey"
    FOREIGN KEY ("project_activity_id") REFERENCES "project_activities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "line_items"
    ADD CONSTRAINT "line_items_uacs_object_id_fkey"
    FOREIGN KEY ("uacs_object_id") REFERENCES "uacs_objects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── climate_change_tags ──────────────────────────────────────────────────────
CREATE TABLE "climate_change_tags" (
    "id"                   TEXT           NOT NULL,
    "project_activity_id"  TEXT           NOT NULL,
    "ccet_code_id"         TEXT           NOT NULL,
    "cca_amount"           DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "ccm_amount"           DECIMAL(18, 2) NOT NULL DEFAULT 0,
    "remarks"              TEXT,
    "created_at"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "climate_change_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "climate_change_tags_project_activity_id_key" ON "climate_change_tags"("project_activity_id");
CREATE INDEX        "climate_change_tags_ccet_code_id_idx"        ON "climate_change_tags"("ccet_code_id");

ALTER TABLE "climate_change_tags"
    ADD CONSTRAINT "climate_change_tags_project_activity_id_fkey"
    FOREIGN KEY ("project_activity_id") REFERENCES "project_activities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "climate_change_tags"
    ADD CONSTRAINT "climate_change_tags_ccet_code_id_fkey"
    FOREIGN KEY ("ccet_code_id") REFERENCES "climate_typology_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
