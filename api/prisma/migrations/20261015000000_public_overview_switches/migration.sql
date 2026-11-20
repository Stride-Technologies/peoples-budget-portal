-- Per-year switches for each public section's Overview tab. The AIP and PPMP
-- Overviews start hidden (both fill up office by office); the Annual Budget
-- Overview starts shown (an enacted budget is complete). Existing years take
-- the same defaults, so the live AIP Overview is hidden until someone turns it on.
ALTER TABLE "aip_cycles"
  ADD COLUMN "public_aip_overview_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "public_annual_overview_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "public_ppmp_overview_enabled" BOOLEAN NOT NULL DEFAULT false;
