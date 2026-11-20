-- specs/012 follow-up: the total allocable budget an LEP is started from.
-- Nullable: an LEP imported from the city's file may not state one.
ALTER TABLE "lep_details" ADD COLUMN "allocable_total" DECIMAL(18,2);

ALTER TABLE "lep_details" ADD CONSTRAINT "lep_details_allocable_total_positive"
  CHECK ("allocable_total" IS NULL OR "allocable_total" > 0);
