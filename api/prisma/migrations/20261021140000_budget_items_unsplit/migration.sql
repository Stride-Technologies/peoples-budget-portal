-- specs/012 P3: own money a Budget Document states as a total only, with no
-- PS/MOOE/FE/CO split (AB 2026 prints 48 such rows, ₱481.7M). Counted in
-- `total`, in no class. Additive.
ALTER TABLE "budget_items" ADD COLUMN "unsplit" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "budget_items" DROP CONSTRAINT "budget_items_amounts_nonnegative";
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_amounts_nonnegative"
    CHECK ("ps" >= 0 AND "mooe" >= 0 AND "fe" >= 0 AND "co" >= 0 AND "unsplit" >= 0
           AND "total" >= "ps" + "mooe" + "fe" + "co" + "unsplit");
