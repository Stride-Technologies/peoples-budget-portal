-- Data Explorer share links (specs/018 redesign P3): immutable workbook state, no personal data.
CREATE TABLE "explorer_snapshots" (
    "id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_snapshots_pkey" PRIMARY KEY ("id")
);
