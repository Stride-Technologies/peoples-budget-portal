-- Financial Expenses (FE) beside every MOOE column, Form 7 office settings and
-- special-fund stated amounts (specs/008). Every new money column defaults to 0
-- (or null where its MOOE twin is nullable), so existing rows — the locked 2026
-- cycle included — are unchanged.

CREATE TYPE "Form7Column" AS ENUM ('GENERAL_PUBLIC', 'SOCIAL', 'ECONOMIC', 'ECONOMIC_ENTERPRISE');

ALTER TABLE "programs"
  ADD COLUMN "fe_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fe_proposed_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "project_activities"
  ADD COLUMN "fe_estimate" DECIMAL(18,2),
  ADD COLUMN "fe_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "fund_allocations" ADD COLUMN "fe" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fund_allocations" DROP CONSTRAINT "fund_allocations_non_negative";
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_non_negative"
  CHECK ("ps" >= 0 AND "mooe" >= 0 AND "fe" >= 0 AND "co" >= 0);

ALTER TABLE "offices"
  ADD COLUMN "form7_column" "Form7Column",
  ADD COLUMN "is_special_fund" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "special_fund_amounts" (
    "id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "aip_cycle_id" TEXT NOT NULL,
    "stated_amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "special_fund_amounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "special_fund_amounts_non_negative" CHECK ("stated_amount" >= 0)
);

CREATE UNIQUE INDEX "special_fund_amounts_office_id_aip_cycle_id_key" ON "special_fund_amounts"("office_id", "aip_cycle_id");

ALTER TABLE "special_fund_amounts" ADD CONSTRAINT "special_fund_amounts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "special_fund_amounts" ADD CONSTRAINT "special_fund_amounts_aip_cycle_id_fkey" FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
