-- CreateEnum
CREATE TYPE "PPMPProjectType" AS ENUM ('GOODS', 'SERVICES', 'CONSULTING_SERVICES', 'INFRASTRUCTURE_PROJECTS');

-- CreateEnum
CREATE TYPE "PPMPProcurementMode" AS ENUM ('SMALL_VALUE_PROCUREMENT', 'COMPETITIVE_BIDDING', 'NEGOTIATED_PROCUREMENT', 'HIGHLY_TECHNICAL_CONSULTANTS');

-- CreateTable
CREATE TABLE "ppmps" (
    "id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "aip_cycle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppmps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppmp_line_items" (
    "id" TEXT NOT NULL,
    "ppmp_id" TEXT NOT NULL,
    "type_of_project" "PPMPProjectType" NOT NULL,
    "mode_of_procurement" "PPMPProcurementMode" NOT NULL,
    "uacs_object_id" TEXT NOT NULL,
    "uacs_code" TEXT NOT NULL,
    "uacs_description" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "fund_source" "FundSource" NOT NULL,
    "expense_class" "ExpenseClass" NOT NULL,
    "remarks" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppmp_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ppmps_office_id_idx" ON "ppmps"("office_id");

-- CreateIndex
CREATE INDEX "ppmps_aip_cycle_id_idx" ON "ppmps"("aip_cycle_id");

-- CreateIndex
CREATE INDEX "ppmp_line_items_ppmp_id_idx" ON "ppmp_line_items"("ppmp_id");

-- CreateIndex
CREATE INDEX "ppmp_line_items_uacs_object_id_idx" ON "ppmp_line_items"("uacs_object_id");

-- AddForeignKey
ALTER TABLE "ppmps" ADD CONSTRAINT "ppmps_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppmps" ADD CONSTRAINT "ppmps_aip_cycle_id_fkey" FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_ppmp_id_fkey" FOREIGN KEY ("ppmp_id") REFERENCES "ppmps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppmp_line_items" ADD CONSTRAINT "ppmp_line_items_uacs_object_id_fkey" FOREIGN KEY ("uacs_object_id") REFERENCES "uacs_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
