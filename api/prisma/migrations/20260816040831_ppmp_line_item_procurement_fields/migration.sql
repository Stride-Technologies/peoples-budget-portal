-- AlterTable
ALTER TABLE "ppmp_line_items"
  ADD COLUMN     "project_name" TEXT NOT NULL,
  ADD COLUMN     "program_id" TEXT NOT NULL,
  ADD COLUMN     "aip_reference_code" TEXT NOT NULL,
  ADD COLUMN     "pre_procurement_conference_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "procurement_start_month" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN     "procurement_start_year" INTEGER NOT NULL DEFAULT 2027,
  ADD COLUMN     "procurement_end_month" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN     "procurement_end_year" INTEGER NOT NULL DEFAULT 2027,
  ADD COLUMN     "delivery_start_month" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN     "delivery_start_year" INTEGER NOT NULL DEFAULT 2027,
  ADD COLUMN     "delivery_end_month" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN     "delivery_end_year" INTEGER NOT NULL DEFAULT 2027,
  ADD COLUMN     "supporting_document_url" TEXT,
  ADD COLUMN     "supporting_document_name" TEXT;

-- CreateIndex
CREATE INDEX "ppmp_line_items_program_id_idx" ON "ppmp_line_items"("program_id");

-- AddForeignKey
ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
