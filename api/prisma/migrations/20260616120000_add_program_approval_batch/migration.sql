-- Batch-gated LFC approval (acceptance-suite Finding 2).
--
-- Adds the persisted proponent-office approval batch. A batch advances through
-- the LFC sequence office-by-office only when every in-scope program is approved
-- by the current office, and finalizes only when the last office has approved
-- them all. `current_sequence_order` tracks the LFC member office (by
-- CommitteeMembership.sequence_order) currently acting on the batch.
--
-- Purely additive: one new table plus two nullable FK columns. Historical
-- ProgramVersion / ProgramApproval rows keep NULL batch ids; new LFC approval
-- rows always carry one.

-- CreateTable
CREATE TABLE "program_approval_batches" (
    "id" TEXT NOT NULL,
    "aip_cycle_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_sequence_order" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_approval_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_approval_batches_aip_cycle_id_city_office_id_idx" ON "program_approval_batches"("aip_cycle_id", "city_office_id");

-- AlterTable
ALTER TABLE "program_versions" ADD COLUMN "approval_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "program_versions_approval_batch_id_idx" ON "program_versions"("approval_batch_id");

-- AlterTable
ALTER TABLE "program_approvals" ADD COLUMN "approval_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "program_approvals_approval_batch_id_idx" ON "program_approvals"("approval_batch_id");

-- AddForeignKey
ALTER TABLE "program_approval_batches" ADD CONSTRAINT "program_approval_batches_aip_cycle_id_fkey" FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approval_batches" ADD CONSTRAINT "program_approval_batches_city_office_id_fkey" FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_approval_batch_id_fkey" FOREIGN KEY ("approval_batch_id") REFERENCES "program_approval_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_approval_batch_id_fkey" FOREIGN KEY ("approval_batch_id") REFERENCES "program_approval_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
