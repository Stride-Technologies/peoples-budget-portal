-- The complete-AIP .xlsx export (a sheet per sector group + funding sources).
--
-- Postgres cannot add an enum value inside a transaction that then uses it, and
-- Prisma wraps each migration in one — hence a migration of its own, applied
-- before anything writes this value.
ALTER TYPE "ExportType" ADD VALUE IF NOT EXISTS 'COMPLETE_AIP';
