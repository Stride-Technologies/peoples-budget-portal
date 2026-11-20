-- CreateEnum
CREATE TYPE "PPACostMode" AS ENUM ('DIRECT_COSTS', 'ACTIVITY_CHILDREN');

-- AlterTable
ALTER TABLE "programs"
ADD COLUMN "implementation_end_month" INTEGER,
ADD COLUMN "implementation_end_year" INTEGER,
ADD COLUMN "implementation_start_month" INTEGER,
ADD COLUMN "implementation_start_year" INTEGER;

-- AlterTable
ALTER TABLE "project_activities"
ADD COLUMN "cost_mode" "PPACostMode" NOT NULL DEFAULT 'DIRECT_COSTS',
ADD COLUMN "implementation_end_month" INTEGER,
ADD COLUMN "implementation_end_year" INTEGER,
ADD COLUMN "implementation_start_month" INTEGER,
ADD COLUMN "implementation_start_year" INTEGER;
