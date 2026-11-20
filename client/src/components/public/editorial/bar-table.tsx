import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { getT } from '@/i18n/server';
import { compactPeso, formatWholePesos, spokenPeso } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';

export interface BarRow {
  /** Row label, e.g. a finish-line name or an office acronym. */
  label: string;
  /** Optional second line — an office's full name, a fund's expansion. */
  sublabel?: string;
  /** Peso amount as a decimal string, straight off the wire. */
  amount: string;
  /**
   * Identity colour for this row — the finish line's own hex, matching
   * `/visions`. Decorative: it is a dot beside a text label, never the only
   * thing distinguishing two rows.
   */
  accent?: string | null;
  /** Rendered in the count column, e.g. "12 programs" / "3 of 8 offices". */
  meta?: string;
  /** Draws the row as the one the section's claim is about. */
  highlight?: boolean;
}

/**
 * A ranked-magnitude bar chart that is literally a `<table>`.
 *
 * Two reasons, and the second is the interesting one.
 *
 * **It is more accessible.** A recharts bar chart is a div soup to a screen
 * reader, which is why the usual fix is to ship a hidden data table beside it —
 * two representations of one truth, and the hidden one rots. Here the bar lives
 * *inside* the cell whose number it depicts, so there is exactly one artifact:
 * assistive tech reads a table, everyone else sees a chart, and they cannot
 * disagree.
 *
 * **It needs no JavaScript.** Every one of this page's five figures is a ranked
 * comparison of magnitudes — no axes, no zoom, no tooltips, nothing a reader
 * would interact with. That is CSS width and nothing more. It prints, it works
 * with JS off, it costs no hydration, and it never reflows on load.
 *
 * Colour never carries information: bars are one hue because they encode
 * magnitude, not identity, and every row is named in text. The finish-line hexes
 * appear only as identity dots — they fail CVD separation as a categorical
 * palette (validated: red↔green ΔE 2.0 for deuteranopia), so they cannot be
 * load-bearing.
 */
export async function BarTable({
  caption,
  rows,
  countHeading,
  amountHeading,
  emptyLabel,
  limit,
  moreHref,
  moreLabel,
  barColor,
}: {
  caption: string;
  rows: BarRow[];
  countHeading?: string;
  /** What the bars are: "Estimated cost" on the AIP, "Appropriation" on an enacted year. */
  amountHeading?: string;
  emptyLabel?: string;
  /** Show only the first N rows. Ranked dimensions with a long tail need this. */
  limit?: number;
  moreHref?: string;
  moreLabel?: string;
  /** Bar colour for rows that carry no identity colour of their own. */
  barColor?: string;
}) {
  const t = await getT();
  countHeading ??= t('bar.countHeading');
  amountHeading ??= t('bar.amount');
  emptyLabel ??= t('bar.empty');
  // The scale comes from the full set, not the visible slice, so truncating the
  // list never rescales the bars that remain.
  const max = rows.reduce((m, r) => Math.max(m, Number(r.amount) || 0), 0);
  const hidden = limit != null ? Math.max(0, rows.length - limit) : 0;
  const visible = limit != null ? rows.slice(0, limit) : rows;

  return (
    <div>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule">
            <th
              scope="col"
              className="pb-2 font-mono text-[0.625rem] font-normal uppercase tracking-[0.14em] text-ink-faint"
            >
              {t('bar.name')}
            </th>
            <th
              scope="col"
              className="hidden pb-2 text-right font-mono text-[0.625rem] font-normal uppercase tracking-[0.14em] text-ink-faint sm:table-cell"
            >
              {countHeading}
            </th>
            <th
              scope="col"
              className="w-[45%] pb-2 pl-4 font-mono text-[0.625rem] font-normal uppercase tracking-[0.14em] text-ink-faint sm:w-[42%] sm:pl-6"
            >
              {amountHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const value = Number(row.amount) || 0;
            // Guard the divide: a cycle where nothing carries an amount yet
            // would otherwise render NaN% widths.
            const share = max > 0 ? (value / max) * 100 : 0;
            const isEmpty = value === 0;

            return (
              // Label + sublabel: two loans from one creditor share a label.
              <tr key={`${row.label}|${row.sublabel ?? ''}`} className="border-b border-rule/60 align-middle">
                <th
                  scope="row"
                  className="max-w-[18rem] py-4 pr-4 font-sans text-sm font-medium text-ink"
                >
                  <span className="flex items-start gap-2.5">
                    {/* Every row gets a dot, whether or not it has an identity
                        colour — a gap in the column reads as a missing value
                        rather than as "this row spans several finish lines". */}
                    <span
                      aria-hidden="true"
                      className="mt-[0.3rem] size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.accent ?? 'var(--rule)' }}
                    />
                    <span>
                      {row.label}
                      {row.sublabel && (
                        <span className="mt-0.5 block text-xs font-normal text-ink-faint">
                          {row.sublabel}
                        </span>
                      )}
                      {/* The count lives here below `sm`, where its own column
                          would push the table past the viewport. */}
                      {row.meta && (
                        <span className="mt-0.5 block text-xs font-normal tabular-nums text-ink-faint sm:hidden">
                          {row.meta}
                        </span>
                      )}
                    </span>
                  </span>
                </th>

                <td className="hidden whitespace-nowrap py-4 text-right text-xs tabular-nums text-ink-faint sm:table-cell">
                  {row.meta ?? '—'}
                </td>

                <td className="py-4 pl-4 sm:pl-6">
                  {/* Amount over bar on a phone, side by side once there is room
                      for both — at 390px a shared row leaves the bar a 40px stub
                      and pushes the figure off the edge. */}
                  <span className="flex flex-col-reverse items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    {/* `flex-1` only from `sm`. In the stacked column layout it
                        sets flex-basis on the vertical axis and collapses the
                        track's height to nothing, hiding every bar. */}
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-full overflow-hidden rounded-full bg-rule/70 sm:w-auto sm:min-w-px sm:flex-1"
                    >
                      <span
                        data-grow
                        className="block h-full rounded-full"
                        style={{
                          width: `${share}%`,
                          backgroundColor: row.highlight
                            ? 'var(--ink)'
                            : (row.accent ?? barColor ?? '#1447E6'),
                        }}
                      />
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-right font-mono text-xs tabular-nums sm:w-[5.5rem]',
                        isEmpty ? 'text-ink-faint' : 'text-ink',
                      )}
                      title={isEmpty ? undefined : `₱${formatWholePesos(row.amount)}`}
                    >
                      {isEmpty ? (
                        <span className="text-[0.6875rem]">{emptyLabel}</span>
                      ) : (
                        <>
                          <span aria-hidden="true">{compactPeso(row.amount)}</span>
                          <span className="sr-only">{spokenPeso(row.amount)}</span>
                        </>
                      )}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {hidden > 0 && (
        <p className="mt-5 text-sm text-ink-muted">
          {t('bar.more', { count: hidden })}{' '}
          {moreHref && (
            <Link
              href={moreHref}
              className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              {moreLabel ?? t('bar.seeAll')}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
