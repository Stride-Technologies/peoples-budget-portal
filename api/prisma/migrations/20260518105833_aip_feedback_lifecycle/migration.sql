-- AlterTable
ALTER TABLE "program_comments" ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_user_id" TEXT;

-- CreateTable
CREATE TABLE "program_read_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_read_states_program_id_idx" ON "program_read_states"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_read_states_user_id_program_id_key" ON "program_read_states"("user_id", "program_id");

-- AddForeignKey
ALTER TABLE "program_read_states" ADD CONSTRAINT "program_read_states_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
