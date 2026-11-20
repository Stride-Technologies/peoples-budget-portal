-- AlterTable
ALTER TABLE "program_comments" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "public_registry_feedback" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- CreateIndex
CREATE INDEX "program_comments_deleted_at_idx" ON "program_comments"("deleted_at");

-- CreateIndex
CREATE INDEX "public_registry_feedback_deleted_at_idx" ON "public_registry_feedback"("deleted_at");
