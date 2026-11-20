/**
 * The first-visit reading guide on an AIP year's pages (specs/013, Appendix A).
 *
 * One entry per fiscal year; a year with no entry shows no guide and no
 * "How to read this page" button. Figures are never written here: `{proposed}`,
 * `{priorTotal}`, `{priorYear}` and `{lastUpdated}` are filled from live data
 * (FR-005), so the copy cannot go stale when a program is published or archived.
 * Plain strings with slots, not JSX, so specs/014 can translate them as-is.
 */
import { spokenPeso } from './currency-formatter.ts';
import { formatManilaDate } from './manila-date.ts';

export interface AipReadingGuideCopy {
  banner: { lead: string; body: string; button: string };
  title: string;
  intro: string;
  sections: {
    heading: string;
    /** Paragraphs; a sentence whose figure is missing is dropped (`fillGuideText`). */
    paragraphs?: string[];
    items?: { term: string; text: string }[];
    link?: { text: string; label: string; href: string };
    /** The illustrative fixed/allocable bar, after the first paragraph. */
    splitBar?: { caption: string; note: string; fixed: string; allocable: string; ariaLabel: string };
  }[];
  reopenHint: string;
  close: string;
}

/**
 * Empty as shipped: the guide is each LGU's own words about its own plan (what stage the AIP is
 * at, who approved it, how to comment). Add an entry for a fiscal year and its pages show the
 * banner, the guide and the "How to read this page" button. The slots of `messageVars` work here.
 */
export const AIP_READING_GUIDE_COPY: Record<number, AipReadingGuideCopy> = {};

export interface AipReadingGuideFigures {
  /** e.g. "₱9.06 billion" — already formatted. */
  proposed: string;
  priorYear: number;
  /** Null when the prior year states no enacted total. */
  priorTotal: string | null;
  /** e.g. "October 27, 2026"; null before anything is published. */
  lastUpdated: string | null;
}

/**
 * Fills `{slot}`s. A sentence that needs a missing figure is dropped, not
 * printed with a hole; null when nothing is left.
 */
export function fillGuideText(
  text: string,
  f: AipReadingGuideFigures,
): string | null {
  const values: Record<string, string | null> = {
    proposed: f.proposed,
    priorYear: String(f.priorYear),
    priorTotal: f.priorTotal,
    lastUpdated: f.lastUpdated,
  };
  const kept = text
    .split(/(?<=\.)\s+/)
    .filter((sentence) =>
      [...sentence.matchAll(/\{(\w+)\}/g)].every(([, key]) => values[key] != null),
    )
    .map((sentence) =>
      sentence.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? ''),
    );
  return kept.length > 0 ? kept.join(' ') : null;
}

/** "₱9.06 billion" — the spoken form, with the sign the eye expects. */
const pesoWords = (amount: string) => `₱${spokenPeso(amount).replace(/ pesos$/, '')}`;

/**
 * The guide's live figures for an AIP year: its proposed total over published
 * programs, the year before's stated enacted total, and its newest publish.
 */
export function aipReadingGuideFigures(
  cycle: { fiscalYear: number; lastPublishedAt: string | null },
  cycles: { fiscalYear: number; statedTotal: string | null }[],
  totalProposed: string,
): AipReadingGuideFigures {
  const priorYear = cycle.fiscalYear - 1;
  const prior = cycles.find((c) => c.fiscalYear === priorYear)?.statedTotal ?? null;
  return {
    proposed: pesoWords(totalProposed),
    priorYear,
    priorTotal: prior ? pesoWords(prior) : null,
    lastUpdated: cycle.lastPublishedAt ? formatManilaDate(cycle.lastPublishedAt) : null,
  };
}
