-- Whether the public Overview may compare this cycle against the previous
-- enacted year. Defaults to false: a comparison drawn from a partly-published
-- proposal is not a rough number, it is a wrong one, and only a person can say
-- when the proposal is comparable.
ALTER TABLE "aip_cycles"
  ADD COLUMN "public_comparison_enabled" BOOLEAN NOT NULL DEFAULT false;
