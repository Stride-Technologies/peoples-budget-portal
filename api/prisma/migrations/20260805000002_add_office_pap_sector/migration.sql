-- Give each Office its usual PAP sector.
--
-- Purely additive and nullable: this replaces `CLUSTER_SECTOR_CODE`, a hardcoded
-- cluster-display-name → sector-code map in the client that was wrong for
-- several offices. Eight offices have no sector on the city's coding sheet and
-- stay NULL for an admin to set.
--
-- Advisory field, NOT an AIP code segment: the code's sector segment comes from
-- `Program.pap_sector_id`, so editing this never restates a reference code.
--
-- `ON DELETE SET NULL` is Prisma's default for an optional relation, and no
-- index is created — Prisma does not index a plain optional FK (compare
-- `programs.sglg_indicator_id`), and `offices` is 63 rows.

ALTER TABLE "offices" ADD COLUMN "pap_sector_id" TEXT;

ALTER TABLE "offices" ADD CONSTRAINT "offices_pap_sector_id_fkey"
  FOREIGN KEY ("pap_sector_id") REFERENCES "pap_sectors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
