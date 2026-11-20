-- specs/017: chart of accounts, receipts, Forms 5 and 6, printed totals,
-- by-object year columns, and source mirroring columns.

-- CreateEnum
CREATE TYPE "AccountGroup" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');


-- CreateEnum
CREATE TYPE "IncomeClass" AS ENUM ('RECURRING', 'NON_RECURRING');


-- AlterTable
ALTER TABLE "budget_object_lines" ADD COLUMN     "account_code" TEXT,
ADD COLUMN     "current_first_sem_actual" DECIMAL(18,2),
ADD COLUMN     "current_second_sem_estimate" DECIMAL(18,2),
ADD COLUMN     "current_year_total" DECIMAL(18,2),
ADD COLUMN     "past_year_actual" DECIMAL(18,2),
ADD COLUMN     "sub_code" TEXT;


-- AlterTable
ALTER TABLE "source_documents" ADD COLUMN     "original_url" TEXT,
ADD COLUMN     "storage_key" TEXT;


-- CreateTable
CREATE TABLE "chart_accounts" (
    "code" TEXT NOT NULL,
    "code10" TEXT,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "account_group" "AccountGroup" NOT NULL,
    "parent_code" TEXT,
    "budget_class" TEXT,
    "is_contra" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chart_accounts_pkey" PRIMARY KEY ("code")
);


-- CreateTable
CREATE TABLE "budget_receipt_lines" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "office_id" TEXT,
    "particulars" TEXT NOT NULL,
    "printed_code" TEXT,
    "account_code" TEXT,
    "sub_code" TEXT,
    "income_class" "IncomeClass",
    "past_year_actual" DECIMAL(18,2),
    "current_first_sem_actual" DECIMAL(18,2),
    "current_second_sem_estimate" DECIMAL(18,2),
    "current_year_total" DECIMAL(18,2),
    "amount" DECIMAL(18,2),
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "source_document_id" TEXT,
    "source_page" INTEGER,
    "source_ref" TEXT,

    CONSTRAINT "budget_receipt_lines_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "budget_indebtedness" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "creditor" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "date_contracted" TEXT,
    "term" TEXT,
    "principal" DECIMAL(18,2) NOT NULL,
    "previous_principal" DECIMAL(18,2),
    "previous_interest" DECIMAL(18,2),
    "budget_year_principal" DECIMAL(18,2),
    "budget_year_interest" DECIMAL(18,2),
    "balance" DECIMAL(18,2),
    "source_document_id" TEXT,
    "source_page" INTEGER,
    "source_ref" TEXT,

    CONSTRAINT "budget_indebtedness_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "budget_statutory_obligations" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_document_id" TEXT,
    "source_page" INTEGER,
    "source_ref" TEXT,

    CONSTRAINT "budget_statutory_obligations_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "budget_printed_totals" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_document_id" TEXT,
    "source_page" INTEGER,
    "source_ref" TEXT,

    CONSTRAINT "budget_printed_totals_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "chart_accounts_code10_key" ON "chart_accounts"("code10");


-- CreateIndex
CREATE INDEX "budget_receipt_lines_document_id_office_id_idx" ON "budget_receipt_lines"("document_id", "office_id");


-- CreateIndex
CREATE INDEX "budget_indebtedness_document_id_idx" ON "budget_indebtedness"("document_id");


-- CreateIndex
CREATE INDEX "budget_statutory_obligations_document_id_idx" ON "budget_statutory_obligations"("document_id");


-- CreateIndex
CREATE INDEX "budget_printed_totals_document_id_kind_idx" ON "budget_printed_totals"("document_id", "kind");


-- AddForeignKey
ALTER TABLE "budget_object_lines" ADD CONSTRAINT "budget_object_lines_account_code_fkey" FOREIGN KEY ("account_code") REFERENCES "chart_accounts"("code") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_receipt_lines" ADD CONSTRAINT "budget_receipt_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "budget_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_receipt_lines" ADD CONSTRAINT "budget_receipt_lines_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "budget_receipt_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_receipt_lines" ADD CONSTRAINT "budget_receipt_lines_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_receipt_lines" ADD CONSTRAINT "budget_receipt_lines_account_code_fkey" FOREIGN KEY ("account_code") REFERENCES "chart_accounts"("code") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_receipt_lines" ADD CONSTRAINT "budget_receipt_lines_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_indebtedness" ADD CONSTRAINT "budget_indebtedness_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "budget_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_indebtedness" ADD CONSTRAINT "budget_indebtedness_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_statutory_obligations" ADD CONSTRAINT "budget_statutory_obligations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "budget_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_statutory_obligations" ADD CONSTRAINT "budget_statutory_obligations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_printed_totals" ADD CONSTRAINT "budget_printed_totals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "budget_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "budget_printed_totals" ADD CONSTRAINT "budget_printed_totals_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
