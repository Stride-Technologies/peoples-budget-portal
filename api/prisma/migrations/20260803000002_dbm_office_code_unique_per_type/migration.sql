-- A DBM office code is unique per office type, not globally.
--
-- `officeType` is its own segment of the AIP reference code
-- (`…-{officeType-1}-{officeCode-3}-…`), so office 027 under OPTIONAL and
-- office 027 under OTHERS still produce distinct AIP codes.
--
-- The new constraint is strictly weaker than the one it replaces, so every
-- existing row already satisfies it.

DROP INDEX "dbm_offices_code_key";

CREATE UNIQUE INDEX "dbm_offices_code_office_type_key" ON "dbm_offices"("code", "office_type");
