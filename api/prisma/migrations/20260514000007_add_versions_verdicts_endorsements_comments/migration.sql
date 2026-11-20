-- ProgramVersion (JSON snapshots on submit), ProgramVerdict (adjudicator decisions),
-- ProgramEndorsement (per-version endorsement signoffs), ProgramComment (free-form discussion).

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "VerdictType"       AS ENUM ('APPROVE', 'INCREASE', 'DECREASE', 'REJECT');
CREATE TYPE "EndorsementStatus" AS ENUM ('PENDING', 'ENDORSED', 'REJECTED');
CREATE TYPE "CommentStage"      AS ENUM ('SECTOR_FEEDBACK', 'HEAD_REVIEW', 'ENDORSEMENT', 'APPROVAL', 'GENERAL');
CREATE TYPE "CommentTarget"     AS ENUM ('PROGRAM', 'PROJECT_ACTIVITY', 'LINE_ITEM');

-- ─── program_versions ─────────────────────────────────────────────────────────
CREATE TABLE "program_versions" (
    "id"                    TEXT         NOT NULL,
    "program_id"            TEXT         NOT NULL,
    "version"               INTEGER      NOT NULL,
    "snapshot"              JSONB        NOT NULL,
    "submitted_by_user_id"  TEXT         NOT NULL,
    "submitted_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "program_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_versions_program_id_version_key" ON "program_versions"("program_id", "version");

ALTER TABLE "program_versions"
    ADD CONSTRAINT "program_versions_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── program_verdicts ─────────────────────────────────────────────────────────
CREATE TABLE "program_verdicts" (
    "id"                   TEXT           NOT NULL,
    "program_id"           TEXT           NOT NULL,
    "program_version_id"   TEXT           NOT NULL,
    "verdict"              "VerdictType"  NOT NULL,
    "amount_suggested"     DECIMAL(18, 2),
    "reason"               TEXT,
    "decided_by_user_id"   TEXT           NOT NULL,
    "decided_at"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "program_verdicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "program_verdicts_program_id_idx"         ON "program_verdicts"("program_id");
CREATE INDEX "program_verdicts_program_version_id_idx" ON "program_verdicts"("program_version_id");

ALTER TABLE "program_verdicts"
    ADD CONSTRAINT "program_verdicts_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "program_verdicts"
    ADD CONSTRAINT "program_verdicts_program_version_id_fkey"
    FOREIGN KEY ("program_version_id") REFERENCES "program_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── program_endorsements ─────────────────────────────────────────────────────
CREATE TABLE "program_endorsements" (
    "id"                       TEXT                 NOT NULL,
    "program_id"               TEXT                 NOT NULL,
    "program_version_id"       TEXT                 NOT NULL,
    "endorser_city_office_id"  TEXT                 NOT NULL,
    "status"                   "EndorsementStatus"  NOT NULL DEFAULT 'PENDING',
    "endorsed_by_user_id"      TEXT,
    "endorsed_at"              TIMESTAMP(3),
    "notes"                    TEXT,
    "created_at"               TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "program_endorsements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_endorsements_program_version_id_endorser_city_office_id_key"
    ON "program_endorsements"("program_version_id", "endorser_city_office_id");
CREATE INDEX "program_endorsements_program_id_idx" ON "program_endorsements"("program_id");

ALTER TABLE "program_endorsements"
    ADD CONSTRAINT "program_endorsements_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "program_endorsements"
    ADD CONSTRAINT "program_endorsements_program_version_id_fkey"
    FOREIGN KEY ("program_version_id") REFERENCES "program_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_endorsements"
    ADD CONSTRAINT "program_endorsements_endorser_city_office_id_fkey"
    FOREIGN KEY ("endorser_city_office_id") REFERENCES "city_offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── program_comments ─────────────────────────────────────────────────────────
CREATE TABLE "program_comments" (
    "id"                   TEXT             NOT NULL,
    "program_id"           TEXT             NOT NULL,
    "program_version_id"   TEXT,
    "author_user_id"       TEXT             NOT NULL,
    "stage"                "CommentStage"   NOT NULL,
    "target_type"          "CommentTarget"  NOT NULL DEFAULT 'PROGRAM',
    "target_id"            TEXT,
    "parent_comment_id"    TEXT,
    "content"              TEXT             NOT NULL,
    "created_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "program_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "program_comments_program_id_idx"          ON "program_comments"("program_id");
CREATE INDEX "program_comments_program_version_id_idx"  ON "program_comments"("program_version_id");
CREATE INDEX "program_comments_parent_comment_id_idx"   ON "program_comments"("parent_comment_id");

ALTER TABLE "program_comments"
    ADD CONSTRAINT "program_comments_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "program_comments"
    ADD CONSTRAINT "program_comments_program_version_id_fkey"
    FOREIGN KEY ("program_version_id") REFERENCES "program_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "program_comments"
    ADD CONSTRAINT "program_comments_parent_comment_id_fkey"
    FOREIGN KEY ("parent_comment_id") REFERENCES "program_comments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
