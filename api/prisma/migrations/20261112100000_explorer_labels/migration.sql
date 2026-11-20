-- specs/018 redesign P5 (W22–W25): what each budget row is, as labels.
CREATE TABLE "explorer_labels" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "label" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '{}',
    "maps" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explorer_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "explorer_rows" (
    "row_id" TEXT NOT NULL,
    "row_kind" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "text_hash" TEXT NOT NULL,
    "embedding" REAL[],
    "labelled_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explorer_rows_pkey" PRIMARY KEY ("row_id")
);

CREATE TABLE "explorer_annotations" (
    "id" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by" TEXT NOT NULL DEFAULT 'model',
    "in_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explorer_annotations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "explorer_labels_parent_id_idx" ON "explorer_labels"("parent_id");
CREATE INDEX "explorer_rows_root_id_idx" ON "explorer_rows"("root_id");
CREATE UNIQUE INDEX "explorer_annotations_row_id_label_id_key" ON "explorer_annotations"("row_id", "label_id");
CREATE INDEX "explorer_annotations_root_id_idx" ON "explorer_annotations"("root_id");

ALTER TABLE "explorer_labels" ADD CONSTRAINT "explorer_labels_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "explorer_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "explorer_annotations" ADD CONSTRAINT "explorer_annotations_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "explorer_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
