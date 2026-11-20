-- specs/020 B4.3: opted-in, scrubbed resident questions for model training. Personal data:
-- on the AGENTS.md / SECURITY.md lists; rows older than 12 months are deleted nightly.
CREATE TABLE "explorer_training_questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "spec" JSONB,
    "verdict" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_training_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "explorer_training_questions_created_at_idx" ON "explorer_training_questions"("created_at");
