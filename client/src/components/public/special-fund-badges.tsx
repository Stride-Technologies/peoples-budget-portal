import { FUND_SOURCES, SPECIAL_FUNDS } from '@/lib/schemas';

/**
 * A badge per special fund the row is charged to (specs/016): the acronym, its
 * full name on hover. Other funds are left out — every row has one, so a badge
 * for the General Fund would be noise.
 */
export function SpecialFundBadges({ funds }: Readonly<{ funds?: readonly string[] | null }>) {
  const special = (funds ?? []).filter((f) => SPECIAL_FUNDS.includes(f));
  if (special.length === 0) return null;
  return special.map((fund) => (
    <span
      key={fund}
      title={FUND_SOURCES.find((f) => f.value === fund)?.description ?? fund}
      className="inline-block shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground"
    >
      {fund}
    </span>
  ));
}
