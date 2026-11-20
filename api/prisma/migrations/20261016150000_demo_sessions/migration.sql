-- Demo deployment control tables (specs/010-lgu-demo). Empty outside the demo's control database.

-- CreateEnum
CREATE TYPE "DemoStep" AS ENUM ('SETUP', 'CUSTOMISE', 'CREATE', 'EDIT', 'PUBLISH', 'LIVE', 'READINESS');

-- CreateEnum
CREATE TYPE "DemoNotificationKind" AS ENUM ('FINISHED', 'DIGEST');

-- CreateTable
CREATE TABLE "demo_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "db_name" TEXT NOT NULL,
    "psgc_code" TEXT,
    "is_lgu" BOOLEAN NOT NULL,
    "lgu_name" TEXT NOT NULL,
    "lgu_context" TEXT,
    "lgu_type" TEXT,
    "visitor_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "palette" TEXT NOT NULL DEFAULT 'civic-blue',
    "steps" JSONB NOT NULL DEFAULT '{}',
    "furthest_step" "DemoStep" NOT NULL DEFAULT 'SETUP',
    "readiness" JSONB,
    "questionnaire_version" INTEGER,
    "email" TEXT,
    "mobile" TEXT,
    "note" TEXT,
    "finished_at" TIMESTAMP(3),
    "digested_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "db_dropped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_notifications" (
    "id" TEXT NOT NULL,
    "kind" "DemoNotificationKind" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "session_ids" TEXT[],
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_token_hash_key" ON "demo_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_db_name_key" ON "demo_sessions"("db_name");

-- CreateIndex
CREATE INDEX "demo_sessions_last_active_at_idx" ON "demo_sessions"("last_active_at");

-- CreateIndex
CREATE INDEX "demo_sessions_finished_at_digested_at_idx" ON "demo_sessions"("finished_at", "digested_at");

-- CreateIndex
CREATE UNIQUE INDEX "demo_notifications_idempotency_key_key" ON "demo_notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "demo_notifications_sent_at_idx" ON "demo_notifications"("sent_at");
