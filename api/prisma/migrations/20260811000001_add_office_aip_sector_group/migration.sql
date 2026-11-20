-- Which sheet an office prints on in the complete-AIP workbook.
--
-- Additive and nullable on purpose. Null is the normal state: the export
-- derives the group from the office's PAP sector, and this column only records
-- the nine offices the budget office files somewhere else than their sector
-- implies. Existing rows keep working untouched.
CREATE TYPE "AipSectorGroup" AS ENUM ('GENERAL_PUBLIC', 'ECONOMIC', 'ENVI_INFRA', 'SOCIAL');

ALTER TABLE "offices" ADD COLUMN "aip_sector_group" "AipSectorGroup";
