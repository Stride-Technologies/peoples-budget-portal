-- Phase 4 (NCPC endorser pivot, OD-4): drop the Program proponent columns.
--
-- Every program is an LGU city-office submission. The `proponent_type` and
-- `civil_society_organization_id` columns (and the ProponentType enum) are no
-- longer used — the implementing `city_office_id` is the proponent. Dropping the
-- columns also drops the FK on civil_society_organization_id and the indexes
-- that reference the dropped columns (the single-column CSO index and the
-- composite (aip_cycle_id, proponent_type) index). Hand-reviewed destructive
-- migration. (Existing NCPC-proponent rows were already removed in Phase 3.)

-- Pre-flight: assert all NCPC-proponent programs were removed in Phase 3.
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM "programs" WHERE "civil_society_organization_id" IS NOT NULL
  ) = 0,
  'Cannot drop civil_society_organization_id: non-null values remain. '
  'Verify that the NCPC-proponent deletion migration (Phase 3) applied successfully.';
END $$;

ALTER TABLE "programs"
  DROP COLUMN "proponent_type",
  DROP COLUMN "civil_society_organization_id";

DROP TYPE "ProponentType";
