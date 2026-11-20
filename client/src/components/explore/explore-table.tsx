/**
 * The explorer's table: always rendered under the chart, the accessible
 * equivalent of it (FR-020) and, on a narrow screen or "Table only", the chart
 * itself. Same idiom as `editorial/bar-table.tsx` — the bar sits in the cell
 * whose number it depicts — but with one column per series and either money
 * or counts, which BarTable does not do.
 */
import { fmt, maxValue, type Line } from '@/lib/explore/chart-data';
import type { ResolvedSeries } from '@/lib/explore/view-url';
import { spokenPeso } from '@/lib/currency-formatter';

export function ExploreTable({
  caption,
  heading,
  totalLabel,
  series,
  lines,
}: {
  caption: string;
  heading: string;
  totalLabel: string;
  series: ResolvedSeries[];
  lines: Line[];
}) {
  const max = maxValue(lines) || 1;
  const th = 'pb-2 font-mono text-[0.625rem] font-normal uppercase tracking-[0.14em] text-ink-faint';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className={th}>{heading}</th>
            {series.map((s) => (
              <th key={s.key} scope="col" className={`${th} min-w-[9rem] pl-4`}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} id={`row-${l.id}`} className="scroll-mt-24 border-b border-rule/60 align-middle target:bg-paper-deep">
              <th scope="row" className="max-w-[18rem] py-3 pr-4 text-sm font-medium text-ink">
                <span className="flex items-center gap-2">
                  {l.accent && <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.accent }} />}
                  <span>{l.label}</span>
                </span>
                {l.sublabel && <span className="mt-0.5 block text-xs font-normal text-ink-faint">{l.sublabel}</span>}
              </th>
              {l.cells.map((c, i) => (
                <td key={i} className="py-3 pl-4">
                  {c.value === null ? (
                    <span className="text-xs text-ink-faint">—</span>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="h-2.5 rounded-sm bg-ink/70" style={{ width: `${Math.max(2, (Number(c.value) / max) * 100)}%`, maxWidth: '60%' }} />
                      <span
                        className="whitespace-nowrap font-mono text-sm tabular-nums text-ink"
                        aria-label={series[i].measure === 'money' ? spokenPeso(c.value) : undefined}
                      >
                        {fmt(series[i], c.value)}
                        {c.share !== null && <span className="ml-1.5 text-xs text-ink-faint">{Math.round(c.share * 100)}%</span>}
                      </span>
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {series.every((s) => s.total !== null) && <tfoot>
          <tr>
            <th scope="row" className="pt-3 text-sm font-semibold text-ink">{totalLabel}</th>
            {series.map((s) => (
              <td key={s.key} className="pt-3 pl-4 font-mono text-sm font-semibold tabular-nums text-ink">
                {fmt(s, s.total!)}
              </td>
            ))}
          </tr>
        </tfoot>}
      </table>
    </div>
  );
}
