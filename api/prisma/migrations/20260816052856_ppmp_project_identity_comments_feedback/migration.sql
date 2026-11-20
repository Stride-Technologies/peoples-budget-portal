-- Data migration: the only existing PPMP row is a confirmed-empty test shell
-- (0 line items) created during this session's own verification work. It
-- cannot satisfy the new NOT NULL programId without a real Program pick, so
-- it is removed rather than backfilled with an arbitrary Program.
DELETE FROM "ppmps";

-- AlterTable: PPMP gains project identity (name/code now derive from a
-- required, unique Program link instead of being typed independently).
ALTER TABLE "ppmps"
  ADD COLUMN     "program_id" TEXT NOT NULL,
  ADD COLUMN     "aip_reference_code" TEXT NOT NULL;

CREATE UNIQUE INDEX "ppmps_program_id_key" ON "ppmps"("program_id");

ALTER TABLE "ppmps" ADD CONSTRAINT "ppmps_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: PPMPLineItem loses its own Program link — every line item now
-- inherits the parent PPMP's single code (specs/005 research.md Decision 1/2).
ALTER TABLE "ppmp_line_items" DROP CONSTRAINT "ppmp_line_items_program_id_fkey";
DROP INDEX "ppmp_line_items_program_id_idx";
ALTER TABLE "ppmp_line_items"
  DROP COLUMN "program_id",
  DROP COLUMN "aip_reference_code";

-- CreateTable
CREATE TABLE "ppmp_comments" (
    "id" TEXT NOT NULL,
    "ppmp_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "parent_comment_id" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppmp_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ppmp_comments_ppmp_id_idx" ON "ppmp_comments"("ppmp_id");
CREATE INDEX "ppmp_comments_parent_comment_id_idx" ON "ppmp_comments"("parent_comment_id");

ALTER TABLE "ppmp_comments" ADD CONSTRAINT "ppmp_comments_ppmp_id_fkey" FOREIGN KEY ("ppmp_id") REFERENCES "ppmps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppmp_comments" ADD CONSTRAINT "ppmp_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppmp_comments" ADD CONSTRAINT "ppmp_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "ppmp_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ppmp_feedback" (
    "id" TEXT NOT NULL,
    "ppmp_id" TEXT NOT NULL,
    "submitter_name" TEXT,
    "submitter_email" TEXT,
    "message" TEXT NOT NULL,
    "official_reply" TEXT,
    "official_replied_at" TIMESTAMP(3),
    "official_replied_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppmp_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ppmp_feedback_ppmp_id_idx" ON "ppmp_feedback"("ppmp_id");

ALTER TABLE "ppmp_feedback" ADD CONSTRAINT "ppmp_feedback_ppmp_id_fkey" FOREIGN KEY ("ppmp_id") REFERENCES "ppmps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
