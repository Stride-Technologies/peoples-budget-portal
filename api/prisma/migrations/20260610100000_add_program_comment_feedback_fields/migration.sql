-- CreateEnum
CREATE TYPE "ProgramFeedbackCategory" AS ENUM ('GENERAL', 'CONCERN', 'SUGGESTION', 'QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProgramCommentSentiment" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- AlterTable: add new columns to program_comments
ALTER TABLE "program_comments"
  ADD COLUMN "submitter_name"  TEXT,
  ADD COLUMN "submitter_email" TEXT,
  ADD COLUMN "category"        "ProgramFeedbackCategory",
  ADD COLUMN "sentiment"       "ProgramCommentSentiment";

-- Backfill: extract submitter name and email from the "[From: Name <email>]\n\n" prefix
-- Pattern 1: "[From: Name <email>]\n\n..."
UPDATE "program_comments"
SET
  submitter_name  = (regexp_match(content, '^\[From: ([^<\]]+?) ?(?:<[^>]+>)?\]'))[1],
  submitter_email = (regexp_match(content, '^\[From: [^<\]]+ <([^>]+)>\]'))[1],
  content = regexp_replace(content, '^\[From: [^\]]+\]\n\n', '')
WHERE stage = 'PUBLIC_FEEDBACK'
  AND content LIKE '[From: %';
