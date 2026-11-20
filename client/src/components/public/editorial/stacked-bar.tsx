import { compactPeso, spokenPeso } from '@/lib/currency-formatter';
import { getT } from '@/i18n/server';

export interface StackedSegment {
  label: string;
  /** What this class of spending actually buys, in plain words. */
  gloss: string;
  amount: string;
  color: string;
}

/**
 * A single bar split into named parts — the expense mix (PS / MOOE / FE / CO).
 *
 * Every segment is labelled with its name, share and amount beneath the bar, so
 * identity never rests on colour. That matters here more than on the ranked bars:
 * three segments of one bar *are* three series, and a legend would put the only
 * key to them in a swatch.
 *
 * The three blues were re-stepped until the validator passed CVD separation
 * (worst adjacent pair ΔE 17.5 deuteran) and the normal-vision floor (ΔE 19.6).
 * They deliberately fail the equal-lightness band that categorical palettes are
 * held to: these are parts of one whole, and the lightness spread is exactly what
 * keeps the segment boundaries readable under every kind of colour vision — and
 * in greyscale, which is how this page prints.
 *
 * A 2px paper-coloured gap separates the fills rather than a border, so adjacent
 * segments never bleed into one another.
 */
export async function StackedBar({
  caption,
  segments,
}: {
  caption: string;
  segments: StackedSegment[];
}) {
  const t = await getT();
  const total = segments.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const share = (amount: string) =>
    total > 0 ? ((Number(amount) || 0) / total) * 100 : 0;

  return (
    <div>
      <div
        aria-hidden="true"
        data-stack
        className="flex h-16 w-full gap-0.5 overflow-hidden rounded-xl"
      >
        {segments.map((s) => (
          <span
            key={s.label}
            className="h-full origin-left first:rounded-l-xl last:rounded-r-xl"
            style={{ width: `${share(s.amount)}%`, backgroundColor: s.color }}
          />
        ))}
      </div>

      <table className="mt-6 w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('stacked.class')}</th>
            <th scope="col">{t('stacked.share')}</th>
            <th scope="col">{t('stacked.amount')}</th>
          </tr>
        </thead>
        <tbody className="sm:flex sm:gap-8">
          {segments.map((s) => (
            <tr
              key={s.label}
              className="block border-b border-rule/60 py-4 sm:flex-1 sm:border-b-0 sm:border-t sm:border-rule sm:py-0 sm:pt-4"
            >
              <th scope="row" className="block text-left">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                    {s.label}
                  </span>
                </span>
              </th>
              <td className="mt-2 block font-display text-3xl font-medium tracking-[-0.02em] text-ink">
                {share(s.amount).toFixed(share(s.amount) < 10 ? 1 : 0)}%
              </td>
              <td className="mt-1 block text-sm text-ink-muted">
                <span aria-hidden="true">{compactPeso(s.amount)}</span>
                <span className="sr-only">{spokenPeso(s.amount)}</span>
                <span className="mt-1 block text-xs text-ink-faint">{s.gloss}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
