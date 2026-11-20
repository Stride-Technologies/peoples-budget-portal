-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('LGU', 'NCPC', 'LFC');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('STAFF', 'HEAD', 'SUPER_ADMIN');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';
COMMIT;

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_department_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "department_id",
ADD COLUMN     "identity_type" "IdentityType",
ALTER COLUMN "password" DROP NOT NULL;

-- DropTable
DROP TABLE "departments";

-- CreateTable
CREATE TABLE "city_offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_lfc" BOOLEAN NOT NULL DEFAULT false,
    "sector_id" TEXT NOT NULL,

    CONSTRAINT "city_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgu_users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgu_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncpc_users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "civil_society_organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ncpc_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish_lines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finish_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome_indicators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outcome_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "finish_line_id" TEXT NOT NULL,
    "outcome_indicator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish_line_sectors" (
    "id" TEXT NOT NULL,
    "finish_line_id" TEXT NOT NULL,
    "sector_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finish_line_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civil_society_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sector_id" TEXT NOT NULL,

    CONSTRAINT "civil_society_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lgu_users_user_id_idx" ON "lgu_users"("user_id");

-- CreateIndex
CREATE INDEX "lgu_users_city_office_id_idx" ON "lgu_users"("city_office_id");

-- CreateIndex
CREATE INDEX "ncpc_users_user_id_idx" ON "ncpc_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invites_token_key" ON "user_invites"("token");

-- CreateIndex
CREATE INDEX "user_invites_user_id_idx" ON "user_invites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "finish_line_sectors_finish_line_id_idx" ON "finish_line_sectors"("finish_line_id");

-- CreateIndex
CREATE INDEX "finish_line_sectors_sector_id_idx" ON "finish_line_sectors"("sector_id");

-- AddForeignKey
ALTER TABLE "city_offices" ADD CONSTRAINT "city_offices_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgu_users" ADD CONSTRAINT "lgu_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgu_users" ADD CONSTRAINT "lgu_users_city_office_id_fkey" FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncpc_users" ADD CONSTRAINT "ncpc_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncpc_users" ADD CONSTRAINT "ncpc_users_civil_society_organization_id_fkey" FOREIGN KEY ("civil_society_organization_id") REFERENCES "civil_society_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_finish_line_id_fkey" FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_outcome_indicator_id_fkey" FOREIGN KEY ("outcome_indicator_id") REFERENCES "outcome_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finish_line_sectors" ADD CONSTRAINT "finish_line_sectors_finish_line_id_fkey" FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finish_line_sectors" ADD CONSTRAINT "finish_line_sectors_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "civil_society_organizations" ADD CONSTRAINT "civil_society_organizations_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
