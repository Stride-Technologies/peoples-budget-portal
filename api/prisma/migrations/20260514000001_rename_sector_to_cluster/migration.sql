-- Rename Sector → Cluster (model), FinishLineSector → FinishLineCluster,
-- and every sector_id FK column → cluster_id. Data is preserved via ALTER ... RENAME.

-- ─── Drop FK constraints that reference sector_id ────────────────────────────
ALTER TABLE "city_offices" DROP CONSTRAINT "city_offices_sector_id_fkey";
ALTER TABLE "finish_line_sectors" DROP CONSTRAINT "finish_line_sectors_sector_id_fkey";
ALTER TABLE "finish_line_sectors" DROP CONSTRAINT "finish_line_sectors_finish_line_id_fkey";
ALTER TABLE "civil_society_organizations" DROP CONSTRAINT "civil_society_organizations_sector_id_fkey";

-- ─── Rename tables ───────────────────────────────────────────────────────────
ALTER TABLE "sectors" RENAME TO "clusters";
ALTER TABLE "finish_line_sectors" RENAME TO "finish_line_clusters";

-- ─── Rename primary key constraints ──────────────────────────────────────────
ALTER TABLE "clusters" RENAME CONSTRAINT "sectors_pkey" TO "clusters_pkey";
ALTER TABLE "finish_line_clusters" RENAME CONSTRAINT "finish_line_sectors_pkey" TO "finish_line_clusters_pkey";

-- ─── Rename columns ──────────────────────────────────────────────────────────
ALTER TABLE "city_offices" RENAME COLUMN "sector_id" TO "cluster_id";
ALTER TABLE "civil_society_organizations" RENAME COLUMN "sector_id" TO "cluster_id";
ALTER TABLE "finish_line_clusters" RENAME COLUMN "sector_id" TO "cluster_id";

-- ─── Rename indexes ──────────────────────────────────────────────────────────
ALTER INDEX "finish_line_sectors_finish_line_id_idx" RENAME TO "finish_line_clusters_finish_line_id_idx";
ALTER INDEX "finish_line_sectors_sector_id_idx" RENAME TO "finish_line_clusters_cluster_id_idx";

-- ─── Recreate FK constraints under new names ─────────────────────────────────
ALTER TABLE "city_offices" ADD CONSTRAINT "city_offices_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finish_line_clusters" ADD CONSTRAINT "finish_line_clusters_finish_line_id_fkey" FOREIGN KEY ("finish_line_id") REFERENCES "finish_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finish_line_clusters" ADD CONSTRAINT "finish_line_clusters_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "civil_society_organizations" ADD CONSTRAINT "civil_society_organizations_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
