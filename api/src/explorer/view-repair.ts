/**
 * Deterministic repairs on a model-written view, before the validator
 * (specs/018 redesign W16). Each one settles a choice the model made
 * differently run to run on dev (2026-11-09), so the same question gets the
 * same chart. Pure; the ask harness and the eval both run them.
 */
import type { Catalogue } from './catalogue.service.js';
import type { Candidate } from './resolve.service.js';
import {
  DOCUMENTS,
  MAX_SERIES,
  type Dimension,
  type DocumentKind,
  type ExplorerView,
  type Series,
} from './view.js';

/**
 * The question names a topic outright ("youth") but the model filtered the
 * same-named tag or cluster, which is only part of it (the Youth tag: ₱205K;
 * the youth topic: ₱3.0M). Category filters the named topic covers become
 * the topic. Offices are left alone: naming one is specific on purpose.
 */
export function preferNamedTopics(
  view: ExplorerView,
  hints: { dim: string; id: string; via: Candidate['via'] }[],
  cat: Pick<Catalogue, 'topicRules'>,
): ExplorerView {
  const named = hints
    .filter((h) => h.dim === 'topic' && h.via === 'alias')
    .map((h) => h.id);
  if (!named.length) return view;
  const CATEGORY: Dimension[] = ['theme', 'cluster', 'sector', 'finishLine'];
  return {
    ...view,
    series: view.series.map((s) => {
      const filters = { ...s.filters };
      for (const t of named) {
        const rules = new Set(
          (cat.topicRules[t] ?? []).map((r) => `${r.kind}:${r.value}`),
        );
        for (const dim of CATEGORY) {
          const vals = filters[dim];
          if (vals?.length && vals.every((v) => rules.has(`${dim}:${v}`))) {
            delete filters[dim];
            filters.topic = [...new Set([...(filters.topic ?? []), t])];
          }
        }
      }
      return { ...s, filters };
    }),
  };
}

const YEAR = /\b(?:19|20)\d{2}\b/g;

/**
 * A by-year view runs over every year the documents have, each kind its own
 * series (R8: never mixed in one). The model asked for AIP 2023 (there is
 * none — the validator refused it) or stopped at the AIP's two years. So:
 * the years asked for (all, when the question names none) are spread over
 * the kinds that have them, AIP first; a kind with fewer than two such years
 * is left out (a line needs two points).
 */
export function fitYearsToKinds(
  view: ExplorerView,
  cat: Pick<Catalogue, 'documents'>,
  question: string,
): ExplorerView {
  if (view.groupBy !== 'year' || !view.series.length) return view;
  const has = (k: DocumentKind) =>
    cat.documents
      .filter((d) => d.kind === k)
      .map((d) => d.year)
      .sort((a, b) => a - b);
  const named = [...new Set(question.match(YEAR) ?? [])].map(Number);
  const asked = named.length ? named : view.series.flatMap((s) => s.years);
  const lo = named.length ? Math.min(...asked) : -Infinity;
  const hi = named.length ? Math.max(...asked) : Infinity;
  const template = view.series[0];
  const order = [
    ...new Set([...view.series.map((s) => s.document), ...DOCUMENTS]),
  ];
  const series: Series[] = [];
  for (const kind of order) {
    const years = has(kind).filter((y) => y >= lo && y <= hi);
    if (years.length < 2) continue;
    const mine = view.series.find((s) => s.document === kind) ?? template;
    // A kind the model did not ask for joins only when the question named no
    // years ("over the years") or named years that kind alone has.
    const joins =
      view.series.some((s) => s.document === kind) ||
      !named.length ||
      named.some((y) => !view.series.some((s) => has(s.document).includes(y)));
    if (!joins) continue;
    // The model's label named its own years; the series now has others.
    const { label: _label, ...rest } = mine;
    series.push({ ...rest, document: kind, years });
  }
  return series.length
    ? { ...view, series: series.slice(0, MAX_SERIES) }
    : view;
}
