-- specs/018 redesign W16: topics people ask about, as rules over the data.
CREATE TABLE "explorer_topics" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "aliases" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explorer_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "explorer_topic_rules" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "explorer_topic_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "explorer_topic_rules_topic_id_idx" ON "explorer_topic_rules"("topic_id");

ALTER TABLE "explorer_topic_rules" ADD CONSTRAINT "explorer_topic_rules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "explorer_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
