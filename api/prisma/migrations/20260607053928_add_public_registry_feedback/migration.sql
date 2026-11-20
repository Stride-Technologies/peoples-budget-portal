-- CreateEnum
CREATE TYPE "RegistryFeedbackCategory" AS ENUM ('GENERAL', 'SPECIFIC_PPA', 'BUDGET_TRANSPARENCY', 'FINISH_LINE_PROGRESS', 'OTHER');

-- CreateTable
CREATE TABLE "public_registry_feedback" (
    "id" TEXT NOT NULL,
    "submitter_name" TEXT,
    "submitter_email" TEXT,
    "category" "RegistryFeedbackCategory" NOT NULL DEFAULT 'GENERAL',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_registry_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_registry_feedback_category_idx" ON "public_registry_feedback"("category");

-- CreateIndex
CREATE INDEX "public_registry_feedback_created_at_idx" ON "public_registry_feedback"("created_at");
