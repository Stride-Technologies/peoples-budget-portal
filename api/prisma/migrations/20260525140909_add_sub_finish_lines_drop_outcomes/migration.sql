/*
  Warnings:

  - You are about to drop the `outcome_indicators` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `outcomes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "outcomes" DROP CONSTRAINT "outcomes_finish_line_id_fkey";

-- DropForeignKey
ALTER TABLE "outcomes" DROP CONSTRAINT "outcomes_outcome_indicator_id_fkey";

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "sub_finish_line_id" TEXT;

-- DropTable
DROP TABLE "outcome_indicators";

-- DropTable
DROP TABLE "outcomes";

-- CreateTable
CREATE TABLE "sub_finish_lines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "finish_line_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_finish_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sub_finish_lines_code_key" ON "sub_finish_lines"("code");

-- CreateIndex
CREATE INDEX "sub_finish_lines_finish_line_id_idx" ON "sub_finish_lines"("finish_line_id");

-- CreateIndex
CREATE INDEX "programs_sub_finish_line_id_idx" ON "programs"("sub_finish_line_id");

-- AddForeignKey
ALTER TABLE "sub_finish_lines" ADD CONSTRAINT "sub_finish_lines_finish_line_id_fkey" FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_sub_finish_line_id_fkey" FOREIGN KEY ("sub_finish_line_id") REFERENCES "sub_finish_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
