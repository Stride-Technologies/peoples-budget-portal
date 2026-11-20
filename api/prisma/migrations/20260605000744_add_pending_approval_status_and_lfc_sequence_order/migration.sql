-- AlterEnum
ALTER TYPE "ProgramStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "committee_memberships" ADD COLUMN     "sequence_order" INTEGER NOT NULL DEFAULT 0;
