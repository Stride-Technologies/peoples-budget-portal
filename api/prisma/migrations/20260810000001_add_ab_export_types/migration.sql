-- The Annual Budget .docx export, per office and for the whole book.
--
-- Postgres cannot add an enum value inside a transaction that then uses it, and
-- Prisma wraps each migration in one — hence a migration of its own, applied
-- before anything writes these values.
ALTER TYPE "ExportType" ADD VALUE IF NOT EXISTS 'AB_OFFICE';
ALTER TYPE "ExportType" ADD VALUE IF NOT EXISTS 'AB_BOOK';
