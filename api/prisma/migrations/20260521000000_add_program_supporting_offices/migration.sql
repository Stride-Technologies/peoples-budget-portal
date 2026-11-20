-- CreateTable
CREATE TABLE "program_supporting_offices" (
    "program_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,

    CONSTRAINT "program_supporting_offices_pkey" PRIMARY KEY ("program_id","city_office_id")
);

-- AddForeignKey
ALTER TABLE "program_supporting_offices" ADD CONSTRAINT "program_supporting_offices_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_supporting_offices" ADD CONSTRAINT "program_supporting_offices_city_office_id_fkey" FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
