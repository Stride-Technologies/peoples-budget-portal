-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "remarks" TEXT;

-- RenameIndex
ALTER INDEX "program_endorsements_program_version_id_endorser_city_office_id" RENAME TO "program_endorsements_program_version_id_endorser_city_offic_key";
