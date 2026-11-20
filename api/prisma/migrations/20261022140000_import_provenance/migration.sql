-- Import provenance on budget-document rows: which file, which page of it
-- (when the file has pages) and, as before, `source_ref` for the table/sheet
-- and row. Additive; `source_documents.url` becomes optional for files we hold
-- but nobody hosts.
ALTER TABLE "source_documents" ALTER COLUMN "url" DROP NOT NULL;

ALTER TABLE "budget_items"
  ADD COLUMN "source_document_id" TEXT,
  ADD COLUMN "source_page" INTEGER;
ALTER TABLE "budget_object_lines"
  ADD COLUMN "source_document_id" TEXT,
  ADD COLUMN "source_page" INTEGER;

ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_object_lines" ADD CONSTRAINT "budget_object_lines_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_source_page_positive"
  CHECK ("source_page" IS NULL OR "source_page" > 0);
ALTER TABLE "budget_object_lines" ADD CONSTRAINT "budget_object_lines_source_page_positive"
  CHECK ("source_page" IS NULL OR "source_page" > 0);
