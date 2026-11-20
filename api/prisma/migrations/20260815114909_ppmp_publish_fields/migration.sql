-- AlterTable
ALTER TABLE "ppmps" ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ppmps_is_published_idx" ON "ppmps"("is_published");
