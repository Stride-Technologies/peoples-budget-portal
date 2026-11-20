/**
 * Topics (specs/018 redesign W16): a subject people ask about, defined as
 * rules over a row's codes and name. A row is in a topic when any rule
 * matches. Membership is derived here on every read — never stored per row —
 * so a corrected rule or a re-imported row needs no rebuild.
 */
import { masker, type Compound } from './phrases.js';
import type { Row } from './sources.js';
import type { ExplorerView, Series } from './view.js';

export const RULE_KINDS = [
  'office',
  'cluster',
  'sector',
  'finishLine',
  'fund',
  'theme',
  'keyword',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export interface TopicRule {
  kind: RuleKind;
  /** A catalogue code (`CAgO`, `health`, `SEF`), or a case-insensitive pattern for `keyword`. */
  value: string;
}

/** A row's catalogue codes, as the view engine resolves them. */
export interface RowCodes {
  office: string;
  cluster: string;
  sector: string;
  finishLine: string;
  themes: string[];
  /** Funds the row has money in (an unsplit multi-fund row has none). */
  funds: string[];
  label: string;
}

/**
 * `mask` blanks the reviewed compounds that must not trigger this topic
 * (`phrases.ts`, decision #16) before its keywords are tested: "capacity
 * building" is not infrastructure although `\bbuilding` would say so.
 */
export function compileTopic(
  rules: TopicRule[],
  mask: (text: string) => string = (t) => t,
): (row: RowCodes) => boolean {
  const sets = new Map<RuleKind, Set<string>>();
  const patterns: RegExp[] = [];
  for (const r of rules) {
    if (r.kind === 'keyword') patterns.push(new RegExp(r.value, 'i'));
    else {
      const set = sets.get(r.kind) ?? new Set<string>();
      set.add(r.value);
      sets.set(r.kind, set);
    }
  }
  const has = (k: RuleKind, v: string) => sets.get(k)?.has(v) ?? false;
  return (row) =>
    has('office', row.office) ||
    has('cluster', row.cluster) ||
    has('sector', row.sector) ||
    has('finishLine', row.finishLine) ||
    row.themes.some((t) => has('theme', t)) ||
    row.funds.some((f) => has('fund', f)) ||
    patterns.some((p) => p.test(mask(row.label)));
}

/**
 * Row → the ids of the topics it belongs to. `codesOf` turns a row's database
 * ids into catalogue codes (the view engine's own `codeOf` lookups).
 */
export function topicsOf(
  topicRules: Record<string, TopicRule[]>,
  codesOf: (r: Row) => RowCodes,
  compounds: Compound[] = [],
): (r: Row) => string[] {
  const mask = masker(compounds);
  const matchers = Object.entries(topicRules).map(
    ([id, rules]) => [id, compileTopic(rules, (t) => mask(id, t))] as const,
  );
  return (r) => {
    const c = codesOf(r);
    return matchers.filter(([, m]) => m(c)).map(([id]) => id);
  };
}

/**
 * A model asked about "youth" tends to filter the topic *and* the Youth
 * Development Office *and* the Youth tag. Filters on different dimensions
 * narrow each other, so that shows a sliver of the topic (dev, 2026-11-09:
 * youth → nothing; farmers → CAgO without ABED). Any filter whose every value
 * is already one of a filtered topic's rules is dropped: it can only cut the
 * topic down to that part, never what someone asking about the topic means.
 */
export function withoutTopicOverlap(
  view: ExplorerView,
  topicRules: Record<string, TopicRule[]>,
): ExplorerView {
  const series = view.series.map((s) => {
    const topics = s.filters.topic ?? [];
    if (!topics.length) return s;
    const covered = new Set(
      topics.flatMap((t) =>
        (topicRules[t] ?? []).map((r) => `${r.kind}:${r.value}`),
      ),
    );
    const filters = Object.fromEntries(
      Object.entries(s.filters).filter(
        ([dim, vals]) =>
          dim === 'topic' || !vals?.every((v) => covered.has(`${dim}:${v}`)),
      ),
    ) as Series['filters'];
    return { ...s, filters };
  });
  return { ...view, series };
}
