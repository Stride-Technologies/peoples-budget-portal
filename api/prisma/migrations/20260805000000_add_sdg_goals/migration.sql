-- Purely additive: two new tables, no changes to `programs`.

-- CreateTable
CREATE TABLE "sdg_goals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "annex_source" TEXT DEFAULT 'UN 2030 Agenda',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdg_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sdg_goals_code_key" ON "sdg_goals"("code");

-- CreateTable
CREATE TABLE "program_sdg_goals" (
    "program_id" TEXT NOT NULL,
    "sdg_goal_id" TEXT NOT NULL,

    CONSTRAINT "program_sdg_goals_pkey" PRIMARY KEY ("program_id","sdg_goal_id")
);

-- AddForeignKey
ALTER TABLE "program_sdg_goals" ADD CONSTRAINT "program_sdg_goals_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_sdg_goals" ADD CONSTRAINT "program_sdg_goals_sdg_goal_id_fkey" FOREIGN KEY ("sdg_goal_id") REFERENCES "sdg_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
