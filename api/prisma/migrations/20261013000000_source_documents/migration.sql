-- Import provenance: which city file, and which row in it, a program or PPA
-- came from — so staff can open the row in the city's own sheet from the
-- registry. Additive only; every existing row stays NULL.

CREATE TABLE "source_documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sheet_gids" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "source_documents_name_key" ON "source_documents"("name");

ALTER TABLE "programs" ADD COLUMN "source_document_id" TEXT, ADD COLUMN "source_ref" TEXT;
ALTER TABLE "programs"
  ADD CONSTRAINT "programs_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_activities" ADD COLUMN "source_document_id" TEXT, ADD COLUMN "source_ref" TEXT;
ALTER TABLE "project_activities"
  ADD CONSTRAINT "project_activities_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
