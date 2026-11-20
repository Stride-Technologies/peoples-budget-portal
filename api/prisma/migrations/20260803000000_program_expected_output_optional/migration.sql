-- Make Program.expectedOutput optional.
--
-- Offices routinely draft a program before the MFO statement is settled, so
-- requiring it blocked saving work in progress. ProjectActivity.expected_output
-- has always been nullable; this brings Program in line.
--
-- Safe: DROP NOT NULL is a catalog-only change (no table rewrite, no data loss)
-- and takes only a brief ACCESS EXCLUSIVE lock. Existing rows are untouched.
-- Reversible with SET NOT NULL provided no NULLs have been written since.
ALTER TABLE "programs" ALTER COLUMN "expected_output" DROP NOT NULL;
