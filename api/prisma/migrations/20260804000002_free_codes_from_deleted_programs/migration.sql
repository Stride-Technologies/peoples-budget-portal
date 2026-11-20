-- Soft-deleted programs used to keep their tentative AIP code. The unique index
-- `programs_tentative_aip_reference_code_key` spans every row, live or not, so a
-- dead row held its code forever: closing its gap renumbered a live sibling into
-- an already-taken value and aborted the transaction
-- (AIPCodesService.resyncTentativeProgramCodes -> writeCodesWithoutCollision).
--
-- Park every already-deleted row on the same '~<id>' sentinel the service now
-- writes at delete time. Sentinels are unique by construction and never parse as
-- an ordinal, so they are invisible to the resync.
UPDATE "programs"
SET "tentative_aip_reference_code" = '~' || "id"
WHERE "deleted_at" IS NOT NULL
  AND "tentative_aip_reference_code" NOT LIKE '~%';
