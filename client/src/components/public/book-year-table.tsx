import type { PublicYearColumns } from '@/lib/api';
import { formatPesoWhole } from '@/lib/currency-formatter';
import { fromCentavos, toCentavos } from '@/lib/version-diff';
import { cn } from '@/lib/utils';

export interface BookRow extends PublicYearColumns {
  id: string;
  label: string;
  /** Nesting under its heading, 0 = top level. */
  depth: number;
  code?: string | null;
  /** A short tag after the label ("one-off" for a non-recurring receipt). */
  tag?: string | null;
  /** A heading row: its figures are the sum the book prints for the rows under it. */
  heading?: boolean;
  amount: string | null;
}

/**
 * The current year as the book prints it: one estimate (the ordinance .xls) or
 * a first-semester actual plus a second-semester estimate (the scanned LEPs),
 * whose sum is shown when the book prints no total.
 */
export function currentYearOf(r: PublicYearColumns): string | null {
  if (r.currentYearTotal !== null) return r.currentYearTotal;
  if (r.currentFirstSemActual === null && r.currentSecondSemEstimate === null) return null;
  return fromCentavos(toCentavos(r.currentFirstSemActual) + toCentavos(r.currentSecondSemEstimate));
}

const cell = (v: string | null) => (v === null ? '' : formatPesoWhole(v));

/**
 * A budget book's three-year table (LBP Forms 2 and the Receipts Program): what
 * was spent or collected two years before, the estimate for the year before,
 * and the budget year. One table, so the years read across, not down.
 */
export function BookYearTable({
  caption,
  fiscalYear,
  amountHeading,
  rows,
}: {
  caption: string;
  fiscalYear: number;
  amountHeading: string;
  rows: BookRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            <th scope="col" className="py-2 pr-4 font-normal">
              Item
            </th>
            <th scope="col" className="py-2 pl-4 text-right font-normal">
              {fiscalYear - 2} actual
            </th>
            <th scope="col" className="py-2 pl-4 text-right font-normal">
              {fiscalYear - 1} estimate
            </th>
            <th scope="col" className="py-2 pl-4 text-right font-normal text-ink">
              {fiscalYear} {amountHeading.toLowerCase()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn('border-b border-rule/60', r.heading && 'font-medium')}>
              <th
                scope="row"
                className="py-1.5 pr-4 text-left font-[inherit] text-ink"
                style={{ paddingLeft: `${r.depth * 1.25}rem` }}
              >
                {r.label}
                {r.tag && (
                  <span className="ml-2 rounded border border-rule px-1 py-px font-mono text-[0.625rem] font-normal text-ink-muted">
                    {r.tag}
                  </span>
                )}
                {r.code && (
                  <span className="ml-2 font-mono text-[0.6875rem] font-normal text-ink-faint">{r.code}</span>
                )}
              </th>
              <td className="whitespace-nowrap py-1.5 pl-4 text-right font-mono tabular-nums text-ink-muted">
                {cell(r.pastYearActual)}
              </td>
              <td className="whitespace-nowrap py-1.5 pl-4 text-right font-mono tabular-nums text-ink-muted">
                {cell(currentYearOf(r))}
              </td>
              <td className="whitespace-nowrap py-1.5 pl-4 text-right font-mono tabular-nums text-ink">
                {cell(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
