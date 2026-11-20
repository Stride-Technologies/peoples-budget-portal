-- specs/018 phase 0: an office keeps one line across years.
-- Nullable, no default: null means "itself". Additive; nothing is rewritten.
ALTER TABLE "offices" ADD COLUMN "lineage_id" TEXT;
CREATE INDEX "offices_lineage_id_idx" ON "offices"("lineage_id");
