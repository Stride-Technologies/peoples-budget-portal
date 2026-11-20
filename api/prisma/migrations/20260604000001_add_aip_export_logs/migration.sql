CREATE TYPE "ExportType" AS ENUM ('CLUSTER');

CREATE TYPE "ExportStatus" AS ENUM ('GENERATED', 'FAILED');

CREATE TABLE "aip_export_logs" (
    "id" TEXT NOT NULL,
    "type" "ExportType" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'GENERATED',
    "aip_cycle_id" TEXT NOT NULL,
    "cluster_id" TEXT,
    "file_name" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "requested_by_role" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filters" JSONB,
    "error_message" TEXT,

    CONSTRAINT "aip_export_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aip_export_logs_aip_cycle_id_idx" ON "aip_export_logs"("aip_cycle_id");
CREATE INDEX "aip_export_logs_cluster_id_idx" ON "aip_export_logs"("cluster_id");
CREATE INDEX "aip_export_logs_requested_by_user_id_idx" ON "aip_export_logs"("requested_by_user_id");

ALTER TABLE "aip_export_logs"
ADD CONSTRAINT "aip_export_logs_aip_cycle_id_fkey"
FOREIGN KEY ("aip_cycle_id") REFERENCES "aip_cycles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "aip_export_logs"
ADD CONSTRAINT "aip_export_logs_cluster_id_fkey"
FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
