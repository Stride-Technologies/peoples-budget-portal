-- AlterTable
ALTER TABLE "public_registry_feedback" ADD COLUMN     "internal_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT;

-- CreateIndex
CREATE INDEX "public_registry_feedback_reviewed_at_idx" ON "public_registry_feedback"("reviewed_at");

-- AddForeignKey
ALTER TABLE "public_registry_feedback" ADD CONSTRAINT "public_registry_feedback_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
