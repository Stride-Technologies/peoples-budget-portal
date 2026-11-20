-- AIPCycle + FinishLineBudgetCeiling + history table.

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "AIPCycleStatus" AS ENUM ('PLANNING', 'OPEN', 'CLOSED', 'LOCKED');
CREATE TYPE "CSOSplitType"   AS ENUM ('PERCENT', 'AMOUNT');

-- ─── AIPCycle ─────────────────────────────────────────────────────────────────
CREATE TABLE "aip_cycles" (
    "id"          TEXT             NOT NULL,
    "fiscal_year" INTEGER          NOT NULL,
    "status"      "AIPCycleStatus" NOT NULL DEFAULT 'PLANNING',
    "opened_at"   TIMESTAMP(3),
    "closed_at"   TIMESTAMP(3),
    "locked_at"   TIMESTAMP(3),
    "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "aip_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aip_cycles_fiscal_year_key" ON "aip_cycles"("fiscal_year");

-- ─── FinishLineBudgetCeiling ──────────────────────────────────────────────────
CREATE TABLE "finish_line_budget_ceilings" (
    "id"                  TEXT           NOT NULL,
    "aip_cycle_id"        TEXT           NOT NULL,
    "finish_line_id"      TEXT           NOT NULL,
    "total_ceiling"       DECIMAL(18, 2) NOT NULL,
    "cso_split_type"      "CSOSplitType" NOT NULL,
    "cso_split_value"     DECIMAL(18, 2) NOT NULL,
    "created_by_user_id"  TEXT           NOT NULL,
    "created_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "finish_line_budget_ceilings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finish_line_budget_ceilings_aip_cycle_id_finish_line_id_key"
    ON "finish_line_budget_ceilings"("aip_cycle_id", "finish_line_id");
CREATE INDEX "finish_line_budget_ceilings_finish_line_id_idx"
    ON "finish_line_budget_ceilings"("finish_line_id");

ALTER TABLE "finish_line_budget_ceilings"
    ADD CONSTRAINT "finish_line_budget_ceilings_aip_cycle_id_fkey"
    FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finish_line_budget_ceilings"
    ADD CONSTRAINT "finish_line_budget_ceilings_finish_line_id_fkey"
    FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── FinishLineBudgetCeilingHistory ───────────────────────────────────────────
CREATE TABLE "finish_line_budget_ceiling_history" (
    "id"                  TEXT           NOT NULL,
    "ceiling_id"          TEXT           NOT NULL,
    "total_ceiling"       DECIMAL(18, 2) NOT NULL,
    "cso_split_type"      "CSOSplitType" NOT NULL,
    "cso_split_value"     DECIMAL(18, 2) NOT NULL,
    "changed_by_user_id"  TEXT           NOT NULL,
    "changed_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finish_line_budget_ceiling_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finish_line_budget_ceiling_history_ceiling_id_idx"
    ON "finish_line_budget_ceiling_history"("ceiling_id");

ALTER TABLE "finish_line_budget_ceiling_history"
    ADD CONSTRAINT "finish_line_budget_ceiling_history_ceiling_id_fkey"
    FOREIGN KEY ("ceiling_id") REFERENCES "finish_line_budget_ceilings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
