-- specs/016 phase 0 (expand): special funds are funds, not offices.
-- `fund_stated_amounts` (fund × cycle) replaces `special_fund_amounts`
-- (office × cycle); `fund_rules` records each fund's legal basis. The old table
-- and `offices.is_special_fund` stay until phase 6 (contract), so code that
-- still reads them keeps working through the rollout.

-- CreateEnum
CREATE TYPE "FundRuleBase" AS ENUM ('NTA', 'REGULAR_REVENUE', 'TOTAL_APPROPRIATION');

-- CreateTable
CREATE TABLE "fund_rules" (
    "id" TEXT NOT NULL,
    "fund_source" "FundSource" NOT NULL,
    "effective_from" INTEGER NOT NULL,
    "legal_basis" TEXT,
    "description" TEXT NOT NULL,
    "minimum_percent" DECIMAL(6,3),
    "minimum_base" "FundRuleBase",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_stated_amounts" (
    "id" TEXT NOT NULL,
    "fund_source" "FundSource" NOT NULL,
    "aip_cycle_id" TEXT NOT NULL,
    "stated_amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_stated_amounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fund_rules_fund_source_effective_from_key" ON "fund_rules"("fund_source", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "fund_stated_amounts_fund_source_aip_cycle_id_key" ON "fund_stated_amounts"("fund_source", "aip_cycle_id");

-- AddForeignKey
ALTER TABLE "fund_stated_amounts" ADD CONSTRAINT "fund_stated_amounts_aip_cycle_id_fkey" FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy the stated amounts across, office acronym → fund. Ids are kept, so the
-- rows stay traceable to the old table until it is dropped. A row on any other
-- office maps to a NULL fund and fails the NOT NULL, so no figure is lost
-- silently (`SpecialFundsService` refuses such rows; there are none).
INSERT INTO "fund_stated_amounts"
  ("id", "fund_source", "aip_cycle_id", "stated_amount", "note",
   "updated_by_user_id", "created_at", "updated_at")
SELECT s."id",
       CASE o."acronym"
         WHEN 'LDF' THEN 'LDF'::"FundSource"
         WHEN 'SPAF' THEN 'SPA'::"FundSource"
         WHEN 'LDRRMF' THEN 'LDRRMF'::"FundSource"
       END,
       s."aip_cycle_id", s."stated_amount", s."note",
       s."updated_by_user_id", s."created_at", s."updated_at"
FROM "special_fund_amounts" s
JOIN "offices" o ON o."id" = s."office_id";

-- The law behind each fund (public record). The percent is a floor: every act
-- here says "not less than". SEF and SHF are dedicated sources with no
-- minimum share of the budget. New law = a new row with a later effective_from.
INSERT INTO "fund_rules"
  ("id", "fund_source", "effective_from", "legal_basis", "description",
   "minimum_percent", "minimum_base", "updated_at")
VALUES
  (gen_random_uuid()::text, 'LDF', 1992,
   'Republic Act 7160 (Local Government Code of 1991), Section 287',
   'At least 20% of the city''s share of national taxes (the National Tax Allotment, called the IRA before 2022) must be set aside for development projects.',
   20, 'NTA', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LDRRMF', 2010,
   'Republic Act 10121 (Philippine Disaster Risk Reduction and Management Act of 2010), Section 21',
   'At least 5% of the city''s expected revenue from regular sources is set aside for disaster risk reduction and management. Of that fund, 30% is kept as a Quick Response Fund for relief and recovery when a disaster strikes.',
   5, 'REGULAR_REVENUE', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SPA', 1992, NULL,
   'Special Purpose Appropriations are amounts the City Council sets aside for purposes outside any one office''s regular budget, such as paying the city''s debts and giving aid to barangays and national government agencies.',
   NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GAD', 2010,
   'Republic Act 9710 (Magna Carta of Women), Section 36',
   'At least 5% of the city''s total budget goes to gender and development: programs that address gender issues and the needs of women, men and families. It is spent through the offices'' regular programs, not as a separate pot of money.',
   5, 'TOTAL_APPROPRIATION', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SEF', 1992,
   'Republic Act 7160 (Local Government Code of 1991), Sections 235 and 272',
   'The Special Education Fund comes from an additional 1% tax on the assessed value of real property. It can only be spent on public schools, as the Local School Board decides.',
   NULL, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SHF', 2019,
   'Republic Act 11223 (Universal Health Care Act), Section 20',
   'The Special Health Fund pools money for the city''s health system, including PhilHealth payments and grants. It can only be spent on health services, health workers and health facilities.',
   NULL, NULL, CURRENT_TIMESTAMP);

-- The three fake offices are retired (soft): their money now carries a fund.
UPDATE "offices" SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "acronym" IN ('LDF', 'SPAF', 'LDRRMF');
