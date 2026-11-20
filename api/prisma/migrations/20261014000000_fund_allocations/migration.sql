-- A row's money split by fund source.
--
-- The FY2027 pre-final AIP writes some PPAs as several funding lines under one
-- description (NCGH "12. Hospital/Facility Building…": GF ₱3M + SHF ₱2M +
-- GAA ₱280M, each with its own PS/MOOE/CO). Until now the import added them into
-- one figure and the per-fund split was lost.
--
-- Optional and additive: a row with no allocations is declared as one total
-- over its `fund_sources`, exactly as before. No existing row changes.

CREATE TABLE "fund_allocations" (
    "id" TEXT NOT NULL,
    "program_id" TEXT,
    "project_activity_id" TEXT,
    "fund_source" "FundSource" NOT NULL,
    "ps" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "mooe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "co" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fund_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fund_allocations_one_owner"
      CHECK (("program_id" IS NULL) <> ("project_activity_id" IS NULL)),
    CONSTRAINT "fund_allocations_non_negative"
      CHECK ("ps" >= 0 AND "mooe" >= 0 AND "co" >= 0)
);

CREATE UNIQUE INDEX "fund_allocations_program_id_fund_source_key" ON "fund_allocations"("program_id", "fund_source");
CREATE UNIQUE INDEX "fund_allocations_project_activity_id_fund_source_key" ON "fund_allocations"("project_activity_id", "fund_source");

ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_project_activity_id_fkey" FOREIGN KEY ("project_activity_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
