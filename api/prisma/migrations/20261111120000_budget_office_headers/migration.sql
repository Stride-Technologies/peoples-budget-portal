-- specs/017: each budget book's office header block, per document.
CREATE TABLE "budget_office_headers" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "mandate_legal_basis" TEXT,
    "vision" TEXT,
    "mission" TEXT,
    "organizational_outcomes" TEXT[],
    "source_document_id" TEXT,
    "source_page" INTEGER,
    "source_ref" TEXT,

    CONSTRAINT "budget_office_headers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "budget_office_headers_document_id_office_id_key" ON "budget_office_headers"("document_id", "office_id");

ALTER TABLE "budget_office_headers" ADD CONSTRAINT "budget_office_headers_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "budget_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_office_headers" ADD CONSTRAINT "budget_office_headers_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_office_headers" ADD CONSTRAINT "budget_office_headers_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
