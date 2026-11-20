-- Add presentation metadata to finish lines so the database is the single
-- source of truth for the short-form name + colour the public view uses.
-- Both columns are nullable and additive — safe on the populated table.
ALTER TABLE "finish_lines" ADD COLUMN "short_name" TEXT;
ALTER TABLE "finish_lines" ADD COLUMN "color" TEXT;
