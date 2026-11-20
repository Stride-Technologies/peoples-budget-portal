-- Phase 1 D9 — the edit history: append-only who-did-what per program.
-- Distinct from program_versions, which snapshots published content.
-- See docs/design/phase-1-publish-scope.md §3.6.

CREATE TYPE "ProgramAuditAction" AS ENUM (
  'PROGRAM_CREATED',
  'PROGRAM_UPDATED',
  'PA_ADDED',
  'PA_UPDATED',
  'PA_REMOVED',
  'ESTIMATE_UPDATED',
  'REVISION_OPENED',
  'DRAFT_SAVED',
  'DRAFT_DISCARDED',
  'PUBLISHED',
  'REPUBLISHED',
  'COMMENT_POSTED',
  'COMMENT_REPLIED',
  'COMMENT_RESOLVED',
  'COMMENT_UNRESOLVED',
  'COMMENT_DELETED',
  'COMMENT_RESTORED',
  'PUBLIC_REPLY_POSTED',
  'PUBLIC_FEEDBACK_REVIEWED',
  'EXPORTED'
);

CREATE TYPE "AuditTargetType" AS ENUM (
  'PROGRAM',
  'PROJECT_ACTIVITY',
  'COMMENT',
  'LINE_ITEM'
);

CREATE TABLE "program_audit_logs" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "target_type" "AuditTargetType" NOT NULL DEFAULT 'PROGRAM',
    "target_id" TEXT,
    "action" "ProgramAuditAction" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" "Role" NOT NULL,
    "on_behalf_of_office_id" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "program_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "program_audit_logs_program_id_created_at_idx" ON "program_audit_logs"("program_id", "created_at");
CREATE INDEX "program_audit_logs_target_type_target_id_created_at_idx" ON "program_audit_logs"("target_type", "target_id", "created_at");
CREATE INDEX "program_audit_logs_actor_user_id_idx" ON "program_audit_logs"("actor_user_id");
CREATE INDEX "program_audit_logs_on_behalf_of_office_id_idx" ON "program_audit_logs"("on_behalf_of_office_id");

-- Cascade from the program: a hard-deleted program takes its trail with it.
-- Programs are only ever soft-deleted in this system, so in practice the trail
-- outlives the record, which is the point.
ALTER TABLE "program_audit_logs" ADD CONSTRAINT "program_audit_logs_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_audit_logs" ADD CONSTRAINT "program_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_audit_logs" ADD CONSTRAINT "program_audit_logs_on_behalf_of_office_id_fkey"
    FOREIGN KEY ("on_behalf_of_office_id") REFERENCES "city_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "program_audit_logs" ADD CONSTRAINT "program_audit_logs_program_version_id_fkey"
    FOREIGN KEY ("program_version_id") REFERENCES "program_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
