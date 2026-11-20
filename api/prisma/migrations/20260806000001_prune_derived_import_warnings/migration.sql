-- Strip the data-gap sentences out of `programs.import_warnings`, keeping only
-- the three that record a decision the 2027 import made.
--
-- Why: the array was written once by the seed and never recomputed, so a
-- sentence like "3 of 12 PPAs have no proposed amount in the workbook" outlived
-- the fix. Filling the amount in changed nothing, INCOMPLETE_IMPORT kept
-- blocking, and 145 of 225 seeded programs were unpublishable except by direct
-- SQL. Those seven kinds are now derived on every read
-- (`src/programs/import-data-warnings.ts`) and surface as advisory `warnings`,
-- so this removes the frozen duplicate rather than the information.
--
-- The three kept patterns must stay in lockstep with `PROVENANCE_OPENERS` in
-- `src/programs/import-data-warnings.ts` — change one, change the other.
--
-- Keep-list rather than drop-list: the corpus is fully enumerated (ten templates,
-- all from `prisma/import-aip-2027-xlsx.ts`), and anything that is not one of
-- these three is by definition a derived sentence that is now recomputed.
-- WITH ORDINALITY preserves the original order; COALESCE turns an
-- everything-stripped row into an empty array rather than NULL.
--
-- Verify with `pnpm --filter api db:audit:warnings`, before and after.
--
-- Measured on the live database 2026-08-06, before this migration: **144 flagged
-- programs, 212 sentences — 94 provenance (92 inferred finish lines, 1 merge, 1
-- synthesised heading) and 118 derived, 0 unclassified.** So expect 144 → 94
-- flagged, 212 → 94 sentences, 118 → 0 derived, and 50 programs off the list.
--
-- The committed workbook JSON holds one more inferred-finish-line program than
-- the live database (93 vs 92, hence 145/213 there). One seeded program is
-- either soft-deleted or was skipped by the additive seed; it changes nothing
-- here, since this UPDATE keys off the array contents and not off a count.
-- Every derived bucket matched the JSON exactly.
UPDATE programs
SET import_warnings = COALESCE((
  SELECT array_agg(w ORDER BY ord)
  FROM unnest(import_warnings) WITH ORDINALITY AS t(w, ord)
  WHERE w LIKE 'Finish line inferred from the implementing office%'
     OR w LIKE 'The workbook lists this program twice%'
     OR w LIKE 'The workbook lists these PPAs with no program heading%'
), ARRAY[]::TEXT[])
WHERE import_warnings <> ARRAY[]::TEXT[];
