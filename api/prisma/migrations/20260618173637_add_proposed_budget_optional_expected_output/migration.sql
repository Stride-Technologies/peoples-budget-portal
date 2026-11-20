-- DropIndex
DROP INDEX "program_comments_public_feedback_root_idx";

-- DropIndex
DROP INDEX "program_endorsements_version_type_idx";

-- AlterTable
ALTER TABLE "project_activities" ADD COLUMN     "proposed_budget" DECIMAL(18,2),
ALTER COLUMN "expected_output" DROP NOT NULL;
