-- LGU feedback analytics: add indexes to support the dashboard queries.
--
-- 1. Partial index for the "unreviewed count" query: filters by
--    stage = PUBLIC_FEEDBACK, parent_comment_id IS NULL, resolved_at IS NULL.
--    Without this, every unreviewed-count call does a full program_comments scan.
--
-- 2. Composite index on (program_id, stage, parent_comment_id) supports the
--    analytics raw queries that JOIN program_comments to programs and filter
--    on stage + parent_comment_id.

CREATE INDEX "program_comments_unreviewed_public_feedback_idx"
  ON "program_comments" ("program_id")
  WHERE "stage" = 'PUBLIC_FEEDBACK'
    AND "parent_comment_id" IS NULL
    AND "resolved_at" IS NULL;

CREATE INDEX "program_comments_public_feedback_root_idx"
  ON "program_comments" ("program_id", "stage", "parent_comment_id");
