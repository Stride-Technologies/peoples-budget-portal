-- AlterEnum
ALTER TYPE "CommentStage" ADD VALUE 'PUBLIC_FEEDBACK';

-- AlterTable
ALTER TABLE "program_comments" ALTER COLUMN "author_user_id" DROP NOT NULL;
