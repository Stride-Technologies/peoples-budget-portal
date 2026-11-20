-- Enum values only. Postgres cannot use a value in the transaction that added
-- it, and Prisma wraps each migration in one, so nothing here may use them; the
-- columns and checks that do are in the next migration.
ALTER TYPE "ExpenseClass" ADD VALUE 'FE';

ALTER TYPE "ExportType" ADD VALUE 'LBP4_OFFICE';
ALTER TYPE "ExportType" ADD VALUE 'LBP4_BOOK';
ALTER TYPE "ExportType" ADD VALUE 'LBP7';
