import { centavos, pesos } from './budget-overview.ts';
import { PPMP_PROCUREMENT_MODES, PPMP_PROJECT_TYPES } from './schemas.ts';
import type { PublicPpmpRecord } from './api.ts';

/**
 * Everything the public PPMP Overview says, from one year's published plans.
 *
 * Pure, so it is tested without a server. Money is summed in whole centavos —
 * see `centavos` in budget-overview.ts — and every slice is a line-item sum, so
 * the slices of one breakdown always add up to `total` exactly.
 */
export interface PpmpSlice {
  key: string;
  label: string;
  sublabel?: string;
  amount: string;
  /** Line items, except for offices, where it counts plans. */
  count: number;
}

export interface PpmpOverview {
  total: string;
  planCount: number;
  lineItemCount: number;
  /** Offices with at least one published plan, against every office. */
  officeCount: number;
  totalOfficeCount: number;
  types: PpmpSlice[];
  modes: PpmpSlice[];
  /** Every month of the fiscal year in order, then any month outside it. */
  months: PpmpSlice[];
  /** Largest planned spend first. */
  offices: PpmpSlice[];
}

/** Line items an office has not classified yet are counted, never dropped. */
export const NOT_STATED = '__not_stated';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tally(
  order: readonly { value: string; label: string }[],
  keyOf: (item: PublicPpmpRecord['lineItems'][number]) => string | null,
  plans: PublicPpmpRecord[],
): PpmpSlice[] {
  const sums = new Map<string, { cents: number; count: number }>();
  for (const plan of plans) {
    for (const item of plan.lineItems) {
      const key = keyOf(item) ?? NOT_STATED;
      const s = sums.get(key) ?? { cents: 0, count: 0 };
      s.cents += centavos(item.lineTotal);
      s.count += 1;
      sums.set(key, s);
    }
  }
  const slices = order.map(({ value, label }) => ({
    key: value,
    label,
    amount: pesos(sums.get(value)?.cents ?? 0),
    count: sums.get(value)?.count ?? 0,
  }));
  const unset = sums.get(NOT_STATED);
  if (unset) slices.push({ key: NOT_STATED, label: 'Not stated yet', amount: pesos(unset.cents), count: unset.count });
  return slices;
}

export function buildPpmpOverview({
  plans,
  fiscalYear,
  totalOfficeCount,
}: {
  plans: PublicPpmpRecord[];
  fiscalYear: number;
  totalOfficeCount: number;
}): PpmpOverview {
  let totalCents = 0;
  let lineItemCount = 0;
  const offices = new Map<string, { label: string; sublabel: string; cents: number; count: number }>();
  for (const plan of plans) {
    const o = offices.get(plan.officeId) ?? {
      label: plan.office.acronym,
      sublabel: plan.office.name,
      cents: 0,
      count: 0,
    };
    for (const item of plan.lineItems) {
      const c = centavos(item.lineTotal);
      totalCents += c;
      o.cents += c;
      lineItemCount += 1;
    }
    o.count += 1;
    offices.set(plan.officeId, o);
  }

  // The fiscal year's twelve months always appear — an empty month is part of
  // the picture — and a purchase planned outside the year is still counted.
  const yearMonths = MONTH.map((m, i) => ({ value: `${fiscalYear}-${String(i + 1).padStart(2, '0')}`, label: `${m} ${fiscalYear}` }));
  const monthKey = (item: PublicPpmpRecord['lineItems'][number]) =>
    `${item.procurementStartYear}-${String(item.procurementStartMonth).padStart(2, '0')}`;
  const outside = new Set<string>();
  for (const plan of plans) for (const item of plan.lineItems) {
    if (item.procurementStartYear !== fiscalYear) outside.add(monthKey(item));
  }
  const otherMonths = [...outside].sort().map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { value: k, label: `${MONTH[m - 1]} ${y}` };
  });
  const months = tally([...yearMonths, ...otherMonths], monthKey, plans).filter(
    (s) => s.key !== NOT_STATED,
  );

  return {
    total: pesos(totalCents),
    planCount: plans.length,
    lineItemCount,
    officeCount: offices.size,
    totalOfficeCount,
    types: tally(PPMP_PROJECT_TYPES, (i) => i.typeOfProject, plans),
    modes: tally(PPMP_PROCUREMENT_MODES, (i) => i.modeOfProcurement, plans),
    months,
    offices: [...offices.entries()]
      .map(([key, o]) => ({ key, label: o.label, sublabel: o.sublabel, amount: pesos(o.cents), count: o.count }))
      .sort((a, b) => centavos(b.amount) - centavos(a.amount) || a.label.localeCompare(b.label)),
  };
}
