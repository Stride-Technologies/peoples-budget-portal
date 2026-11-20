-- specs/020 B1.1: what each answer was, and what each verdict is about.
-- Nullable columns with no default: metadata-only ALTERs, no table rewrite.
ALTER TABLE "explorer_questions" ADD COLUMN "spec" JSONB;

ALTER TABLE "explorer_feedback" ADD COLUMN "spec" JSONB,
ADD COLUMN "spec_hash" TEXT;

CREATE INDEX "explorer_feedback_spec_hash_idx" ON "explorer_feedback"("spec_hash");
