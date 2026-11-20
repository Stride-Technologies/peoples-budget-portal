-- AlterTable
ALTER TABLE "program_comments" ADD COLUMN     "official_replied_at" TIMESTAMP(3),
ADD COLUMN     "official_replied_by_user_id" TEXT,
ADD COLUMN     "official_reply" TEXT,
ADD COLUMN     "official_reply_edited_at" TIMESTAMP(3);
