-- specs/018 phase 3: the Data Explorer's question, model-call and feedback log
-- (R15, R16). Three new tables; nothing existing is touched. No IP, user agent,
-- user id or audio column anywhere. All three are on the personal-data list.

CREATE TABLE "explorer_questions" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "lang" TEXT NOT NULL,
    "normalised_hash" TEXT NOT NULL,
    "answered_by" TEXT NOT NULL,
    "view" JSONB,
    "refusal" TEXT,
    "catalogue_version" TEXT NOT NULL,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "explorer_model_calls" (
    "id" TEXT NOT NULL,
    "question_id" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "raw_output" TEXT,
    "validated_output" JSONB,
    "ok" BOOLEAN NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_model_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "explorer_feedback" (
    "id" TEXT NOT NULL,
    "question_id" TEXT,
    "call_id" TEXT,
    "verdict" TEXT NOT NULL,
    "reason" TEXT,
    "text" TEXT,
    "device_key_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "explorer_questions_created_at_idx" ON "explorer_questions"("created_at");
CREATE INDEX "explorer_questions_normalised_hash_idx" ON "explorer_questions"("normalised_hash");
CREATE INDEX "explorer_model_calls_created_at_idx" ON "explorer_model_calls"("created_at");
CREATE INDEX "explorer_feedback_created_at_idx" ON "explorer_feedback"("created_at");

ALTER TABLE "explorer_model_calls" ADD CONSTRAINT "explorer_model_calls_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "explorer_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "explorer_feedback" ADD CONSTRAINT "explorer_feedback_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "explorer_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "explorer_feedback" ADD CONSTRAINT "explorer_feedback_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "explorer_model_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
