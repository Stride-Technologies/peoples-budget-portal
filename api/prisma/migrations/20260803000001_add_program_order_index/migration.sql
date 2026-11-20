-- Add Program.order_index — user-controlled rank within the AIP code scope
-- (aip_cycle_id, city_office_id, pap_sector_id).
--
-- Why: the program ordinal segment of the tentative AIP reference code used to
-- come from AIPCodeCounter, a monotonic counter. A counter cannot express
-- "close the gap after a delete" or "the user dragged this program up", so the
-- ordinal becomes a rank derived from this column instead. Mirrors the existing
-- ProjectActivity.order_index, which already works this way.
--
-- Safe: ADD COLUMN with a non-volatile DEFAULT is metadata-only on PG 11+ (no
-- table rewrite). The backfill below is a single UPDATE over a small table.
ALTER TABLE "programs" ADD COLUMN "order_index" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the ordinal already encoded in each program's tentative code so
-- that the first resync after deploy is a no-op and no existing code churns.
--
-- Program codes are 7 segments: {sector}-{subsector}-{lgu}-{type}-{office}-{PPP}-{NNN}.
-- The program ordinal is the second-to-last segment. Rows whose code does not
-- match that shape (legacy/retired formats) fall back to 0 and will be ranked by
-- created_at on first resync.
UPDATE "programs"
SET "order_index" = CASE
  WHEN "tentative_aip_reference_code" ~ '^([0-9]+-){5}[0-9]+-[0-9]+$'
    THEN (
      (string_to_array("tentative_aip_reference_code", '-'))[
        array_length(string_to_array("tentative_aip_reference_code", '-'), 1) - 1
      ]
    )::integer
  ELSE 0
END;

CREATE INDEX "programs_aip_cycle_id_city_office_id_pap_sector_id_order_index_idx"
  ON "programs" ("aip_cycle_id", "city_office_id", "pap_sector_id", "order_index");
