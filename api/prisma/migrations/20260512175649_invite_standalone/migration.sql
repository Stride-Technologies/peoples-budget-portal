-- DropForeignKey
ALTER TABLE "user_invites" DROP CONSTRAINT "user_invites_user_id_fkey";

-- AlterTable: add new columns as nullable first, then backfill from users, then add NOT NULL
ALTER TABLE "user_invites"
  ADD COLUMN "city_office_id" TEXT,
  ADD COLUMN "civil_society_organization_id" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "identity_type" "IdentityType",
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STAFF',
  ALTER COLUMN "user_id" DROP NOT NULL;

-- Backfill invite data from the linked user rows
UPDATE "user_invites" ui
SET
  "email"      = u.email,
  "first_name" = u.first_name,
  "last_name"  = u.last_name,
  "identity_type" = u.identity_type
FROM "users" u
WHERE ui.user_id = u.id;

-- Delete any orphaned invites that have no user (shouldn't exist, but just in case)
DELETE FROM "user_invites" WHERE "email" IS NULL;

-- Now apply NOT NULL constraints
ALTER TABLE "user_invites"
  ALTER COLUMN "email"      SET NOT NULL,
  ALTER COLUMN "first_name" SET NOT NULL,
  ALTER COLUMN "last_name"  SET NOT NULL;

-- CreateIndex
CREATE INDEX "user_invites_email_idx" ON "user_invites"("email");

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
