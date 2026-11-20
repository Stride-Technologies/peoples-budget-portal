-- LFC Committee Approval
--
-- Adds the committee-consensus approval gate: a Committee + CommitteeMembership
-- many-to-many and per-(version, committee, office) ProgramApproval rows.
-- Adds the FOR_REVISION program status (the named "returned for revision"
-- state) and removes the inert city_offices.is_lfc flag (nothing read it;
-- committee membership now lives in committee_memberships).

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ProgramStatus" ADD VALUE 'FOR_REVISION';

-- AlterTable
ALTER TABLE "city_offices" DROP COLUMN "is_lfc";

-- CreateTable
CREATE TABLE "committees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_memberships" (
    "id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_approvals" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "program_version_id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "committees_code_key" ON "committees"("code");

-- CreateIndex
CREATE INDEX "committee_memberships_city_office_id_idx" ON "committee_memberships"("city_office_id");

-- CreateIndex
CREATE UNIQUE INDEX "committee_memberships_committee_id_city_office_id_key" ON "committee_memberships"("committee_id", "city_office_id");

-- CreateIndex
CREATE INDEX "program_approvals_program_id_idx" ON "program_approvals"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_approvals_program_version_id_committee_id_city_offi_key" ON "program_approvals"("program_version_id", "committee_id", "city_office_id");

-- AddForeignKey
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_city_office_id_fkey" FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "program_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_city_office_id_fkey" FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
