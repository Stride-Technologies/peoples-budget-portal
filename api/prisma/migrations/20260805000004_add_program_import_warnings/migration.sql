-- Review queue for bulk-imported programs.
--
-- The 2027 workbook import has to make calls the workbook does not answer:
-- which finish line a program belongs to (the sheets state none), what to do
-- with a row dated 2026, a funding source spelled in a way the enum has no
-- value for. Each of those becomes a sentence in this array, and a non-empty
-- array blocks publishing (`INCOMPLETE_IMPORT` in ProgramPublishService), so an
-- office must look at the row before citizens ever see it.
--
-- Additive and safe: defaults to an empty array, so every existing program is
-- unaffected and stays exactly as publishable as it is today.

-- AlterTable
ALTER TABLE "programs" ADD COLUMN "import_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[];
