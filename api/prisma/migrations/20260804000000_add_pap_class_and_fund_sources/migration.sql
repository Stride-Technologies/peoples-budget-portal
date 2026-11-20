-- AIP form section (GAS / STO / Operations) on Program, and the multi-valued
-- fund source list on ProjectActivity.
--
-- Both are purely additive: `pap_class` is nullable and `fund_sources` defaults
-- to an empty array, so every existing row stays valid and keeps exporting the
-- way it does today (legacy rows print under III. OPERATIONS with funding
-- source GF). No backfill — guessing a section for live programs is worse than
-- leaving it blank for the office to set.

-- CreateEnum
CREATE TYPE "PapClass" AS ENUM ('GAS', 'STO', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "FundSource" AS ENUM ('GF', 'SEF', 'LDF', 'LDRRMF', 'SPA', 'PPP', 'NGA', 'DONATIONS_GRANTS', 'GAD', 'TRUST_FUND');

-- AlterTable
ALTER TABLE "programs" ADD COLUMN "pap_class" "PapClass";

-- AlterTable
ALTER TABLE "project_activities" ADD COLUMN "fund_sources" "FundSource"[] DEFAULT ARRAY[]::"FundSource"[];
