-- Thematic tags: an open, extensible catalog of beneficiary categories (PWD,
-- Senior Citizens, Youth, Women, Children, LGBTQIA+, and anything created
-- since) that a Program and any of its Project/Activities can each carry any
-- number of, independently. See specs/006-thematic-tags/data-model.md.
--
-- Additive only: two new ProgramAuditAction values for logging, three new
-- tables. No existing table or column changes.

-- AlterEnum
ALTER TYPE "ProgramAuditAction" ADD VALUE 'TAG_ADDED';
ALTER TYPE "ProgramAuditAction" ADD VALUE 'TAG_REMOVED';

-- CreateTable
CREATE TABLE "thematic_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thematic_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "thematic_tags_normalized_name_key" ON "thematic_tags"("normalized_name");

-- CreateTable
CREATE TABLE "program_thematic_tags" (
    "program_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "applied_by_user_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_thematic_tags_pkey" PRIMARY KEY ("program_id","tag_id")
);

CREATE INDEX "program_thematic_tags_tag_id_idx" ON "program_thematic_tags"("tag_id");

-- CreateTable
CREATE TABLE "project_activity_thematic_tags" (
    "project_activity_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "applied_by_user_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_thematic_tags_pkey" PRIMARY KEY ("project_activity_id","tag_id")
);

CREATE INDEX "project_activity_thematic_tags_tag_id_idx" ON "project_activity_thematic_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "thematic_tags" ADD CONSTRAINT "thematic_tags_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_thematic_tags" ADD CONSTRAINT "program_thematic_tags_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_thematic_tags" ADD CONSTRAINT "program_thematic_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "thematic_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_thematic_tags" ADD CONSTRAINT "program_thematic_tags_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_thematic_tags" ADD CONSTRAINT "project_activity_thematic_tags_project_activity_id_fkey" FOREIGN KEY ("project_activity_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_activity_thematic_tags" ADD CONSTRAINT "project_activity_thematic_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "thematic_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_activity_thematic_tags" ADD CONSTRAINT "project_activity_thematic_tags_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
