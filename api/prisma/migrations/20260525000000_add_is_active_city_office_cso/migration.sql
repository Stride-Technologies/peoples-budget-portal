-- Add soft-delete flag to city_offices and civil_society_organizations.
-- Existing rows default to active (true).

ALTER TABLE "city_offices" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "civil_society_organizations" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
