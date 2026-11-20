/**
 * Explain from templates (specs/018 P2, design §4): the fact sheet the API
 * computed, turned into a headline, up to four bullets and the limits. Pure, so
 * every sentence is unit-tested. It returns message keys and slots, never
 * prose: the sentences live in `en.json` and go through the translation and
 * review flow (spec 014), and the numbers are put in by code, never typed by a
 * translator. A figure is a link to its table row, so the reader can check it.
 */
import { fmt } from './chart-data.ts';
import type { Caveat, FactSheet, ResolvedSeries } from './view-url.ts';

export interface Figure {
  text: string;
  /** `#row-<id>` in the table under the chart; none for a total. */
  href: string | null;
}
export interface Sentence {
  key: string;
  /** Plain slots; a slot named in `figures` is rendered as a link instead. */
  vars: Record<string, string | number>;
  figures: Record<string, Figure>;
}
export interface Explanation {
  headline: Sentence;
  bullets: Sentence[];
  limits: Sentence[];
  sources: { label: string; href: string | null }[];
}

const MAX_BULLETS = 4;
const pct = (share: number | null) => Math.round((share ?? 0) * 100);
const s = (key: string, vars: Sentence['vars'] = {}, figures: Sentence['figures'] = {}): Sentence => ({ key, vars, figures });
/** A caveat with nothing to say in a sentence of its own. */
const QUIET: Caveat[] = ['other-row'];

export function explain(facts: FactSheet, series: ResolvedSeries[]): Explanation {
  const measureOf = (key: string) => series.find((x) => x.key === key) ?? { measure: 'money' as const, countWord: 'programs' };
  const totalOf = (f: FactSheet['series'][number]) => {
    const m = measureOf(f.key);
    // By year there is no total (years are not added up): lead with the latest year.
    if (f.total === null) {
      const last = series.find((x) => x.key === f.key)?.rows.at(-1);
      return s('explore.explain.latestYear', { series: f.label, year: last?.label ?? '' }, { value: { text: fmt(m, last?.value ?? '0'), href: last ? `#row-${last.id}` : null } });
    }
    return m.measure === 'count'
      ? s('explore.explain.headlineCount', { series: f.label }, { total: { text: fmt(m, f.total), href: null } })
      : s('explore.explain.headline', { series: f.label, n: f.n, countWord: m.countWord }, { total: { text: fmt(m, f.total), href: null } });
  };

  const [first, ...rest] = facts.series;
  const bullets: Sentence[] = rest.map(totalOf);
  // Themes overlap, so their shares do not add up and "together" would be wrong.
  const additive = !facts.caveats.includes('tags-overlap');

  for (const f of facts.series) {
    const m = measureOf(f.key);
    const fig = (r: { id: string; value: string }): Figure => ({ text: fmt(m, r.value), href: `#row-${r.id}` });
    const top = f.top[0];
    if (f.biggestChange) {
      const c = f.biggestChange;
      const up = !c.delta.startsWith('-');
      bullets.push(
        s(up ? 'explore.explain.changeUp' : 'explore.explain.changeDown',
          { period: c.label, pct: c.pct === null ? '' : ` (${Math.abs(c.pct)}%)` },
          { delta: { text: fmt(m, c.delta.replace(/^-/, '')), href: null } }),
      );
    } else if (top && f.top.length > 1 && facts.series.length > 1) {
      // Compared: one sentence per series, named, rather than three about the first.
      bullets.push(s('explore.explain.largestIn', { series: f.label, row: top.label, pct: pct(top.share) }, { value: fig(top) }));
    } else if (top && f.top.length > 1) {
      bullets.push(s('explore.explain.largest', { row: top.label, pct: pct(top.share) }, { value: fig(top) }));
      if (additive && f.top.length >= 3 && f.bottom.length > 0) {
        const three = f.top.slice(0, 3).reduce((a, r) => a + (r.share ?? 0), 0);
        bullets.push(s('explore.explain.topThree', { pct: pct(three) }));
      }
      const low = f.bottom.at(-1);
      if (low) bullets.push(s('explore.explain.smallest', { row: low.label }, { value: fig(low) }));
    }
  }

  const limits = facts.caveats.filter((c) => !QUIET.includes(c)).map((c) => s(`explore.explain.limit.${c}`));
  if (!facts.caveats.includes('estimated-cost-not-spent')) limits.push(s('explore.explain.limit.default'));

  return {
    headline: totalOf(first),
    bullets: bullets.slice(0, MAX_BULLETS),
    limits,
    sources: facts.documents.map((d) => ({
      label: d.label,
      href: d.kind === 'aip' ? `/aip/${d.year}/browse` : d.kind === 'ordinance' ? `/annual/${d.year}/browse` : null,
    })),
  };
}
