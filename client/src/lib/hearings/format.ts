/**
 * The hearings API's shapes (docs/hearings-api.md, contract v1) and the pure helpers the pages
 * share. Nothing here fetches: `api.ts` does. Everything that comes from the API is another
 * party's data, so anything that becomes a URL goes through `safeUrl` or `safeId` first.
 */

/** One entry of `sessions/index.json`. */
export interface SessionEntry {
  id: string;
  title: string;
  /** `YYYY-MM-DD`. */
  date?: string;
  durationSec: number;
  /** Which body met: an id listed in `hearings.json`. Absent means the first one. */
  body?: string;
  /** Where the video is. Absent: `file` when the id starts with `fb`, else `youtube` (v1 rule). */
  source?: 'youtube' | 'file';
}

/** One line of `sessions/<id>.json`. */
export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Set on broadcast audio that is not part of the session: an ad, a jingle. */
  skip?: string;
  /** Per-word `[start, end]` in seconds, when the pipeline aligned the line. */
  words?: number[][] | null;
  /** Set by the page when a reviewer's corrected text replaced the machine's. */
  reviewed?: boolean;
}

export interface SummaryItem {
  lead: string;
  text: string;
  /** Indexes into the session's segments: where to check the claim. */
  refs: number[];
}
export interface SummaryIssue {
  topic: string;
  summary: string;
  offices?: string[];
  refs: number[];
  /** Goal numbers, 1 to 8. */
  finishLines?: number[];
  cluster?: string;
  /** Seconds into the session. */
  at?: number;
}
/** `sessions/<id>.summary[.<lang>].json`. */
export interface Summary {
  headline?: string;
  glance: SummaryItem[];
  sections: { title: string; items: SummaryItem[]; finishLines?: number[] }[];
  issues: SummaryIssue[];
  meta?: { model?: string };
}

/** One entry of `sessions/<id>.links.json`: a document named in the session. */
export interface DocumentLink {
  seg: number;
  kind: string;
  no?: string | null;
  title: string;
  url: string;
}
/** One entry of `councilors.json`. */
export interface Councilor {
  slug: string;
  name: string;
  role?: string;
}
/** `portal.json`: the LGU's goals and clusters, as the issues are tagged with them. */
export interface Goals {
  finishLines: Record<string, string>;
  clusters: string[];
}
/** One entry of `glossary.json`. */
export interface GlossaryEntry {
  term: string;
  short?: string;
  definition: string;
  url?: string;
}
/** One entry of `api/councilors/<slug>/actions`: confirmed by a reviewer. */
export interface CouncilorAction {
  session_id: string;
  kind: string;
  text: string;
  at: number;
}
/** `hearings.json`, optional: what the site is and which bodies it covers. */
export interface HearingsSite {
  bodies?: { id: string; name: string; about?: string }[];
}

/** The summary languages the contract names, and the page language each one serves. */
export const SUMMARY_LANGS = ['en', 'tl', 'bcl'] as const;
export type SummaryLang = (typeof SUMMARY_LANGS)[number];
export const summaryLangFor = (locale: string): SummaryLang =>
  locale === 'fil' ? 'tl' : locale === 'bcl' ? 'bcl' : 'en';

/** A session or councilor id, safe inside a path. Anything else is refused. */
export const safeId = (id: unknown): string | null =>
  typeof id === 'string' && /^[\w-]{1,64}$/.test(id) ? id : null;

/** An http(s) link from the API, or null. Stops `javascript:` and friends reaching an href. */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** `3725` → `01:02:05`. */
export const clock = (sec: number): string =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), Math.floor(sec % 60)]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');

/** `14693` → `4.1`: a session's length in hours, one decimal. */
export const hours = (durationSec: number): number => Math.round(durationSec / 360) / 10;

export const sourceOf = (s: Pick<SessionEntry, 'id' | 'source'>): 'youtube' | 'file' =>
  s.source ?? (s.id.startsWith('fb') ? 'file' : 'youtube');

/** A session's poster: the API's own frame for a file, YouTube's for a YouTube video. */
export const posterUrl = (apiUrl: string, s: Pick<SessionEntry, 'id' | 'source'>): string =>
  sourceOf(s) === 'file'
    ? `${apiUrl}/video/${encodeURIComponent(s.id)}.jpg`
    : `https://i.ytimg.com/vi/${encodeURIComponent(s.id)}/hqdefault.jpg`;

/** The bodies a site covers: `hearings.json`'s, else the ids the index uses, in first-seen order. */
export function bodiesOf(index: SessionEntry[], site: HearingsSite | null): { id: string; name?: string; about?: string }[] {
  if (site?.bodies?.length) return site.bodies;
  const ids = [...new Set(index.map((s) => s.body ?? ''))];
  return (ids.length ? ids : ['']).map((id) => ({ id }));
}
/** A session's body id, with "absent" meaning the first body. */
export const bodyOf = (s: SessionEntry, bodies: { id: string }[]): string => s.body ?? bodies[0]?.id ?? '';

/**
 * When each word of a line is said. The pipeline's aligned times when they fit the text;
 * else spread across the line by word length, which beats an even spread.
 */
export function wordTimes(seg: Segment): number[] {
  const words = seg.text.split(' ');
  if (seg.words?.length === words.length) return seg.words.map((w) => w[0]);
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let before = 0;
  return words.map((w) => {
    const at = seg.start + ((seg.end - seg.start) * before) / total;
    before += w.length + 1;
    return at;
  });
}

/** The line being said at `t`, or -1. */
export const segmentAt = (segments: Segment[], t: number): number =>
  segments.findIndex((g) => t >= g.start && t < g.end);

/** Reviewed text replaces the machine's; its words differ, so its timings go. */
export function withReviewed(segments: Segment[], reviewed: { seg_idx: number; text: string }[]): Segment[] {
  const out = segments.slice();
  for (const r of reviewed)
    if (out[r.seg_idx] && typeof r.text === 'string')
      out[r.seg_idx] = { ...out[r.seg_idx], text: r.text, words: null, reviewed: true };
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Glossary terms said in the session, with the lines that say them, in order of first mention. */
export function termsUsed(glossary: GlossaryEntry[], segments: Segment[]): (GlossaryEntry & { refs: number[] })[] {
  return glossary
    .map((e) => {
      // The full term in any case; the abbreviation only as written (AIP, not "aip").
      const res = [new RegExp(`\\b${escapeRe(e.term)}\\b`, 'i'), ...(e.short ? [new RegExp(`\\b${escapeRe(e.short)}\\b`)] : [])];
      return { ...e, refs: segments.flatMap((g, i) => (!g.skip && res.some((r) => r.test(g.text)) ? [i] : [])) };
    })
    .filter((e) => e.refs.length)
    .sort((a, b) => a.refs[0] - b.refs[0]);
}

/** One entry per document, with every line that mentions it. */
export function documentsMentioned(links: DocumentLink[]): (DocumentLink & { refs: number[] })[] {
  const byUrl = new Map<string, DocumentLink & { refs: number[] }>();
  for (const l of links) {
    const url = safeUrl(l.url);
    if (!url) continue;
    const seen = byUrl.get(url);
    if (seen) seen.refs.push(l.seg);
    else byUrl.set(url, { ...l, url, refs: [l.seg] });
  }
  return [...byUrl.values()];
}

/** Up to six distinct lines to check a claim against. */
export const checkRefs = (refs: number[] | undefined): number[] => [...new Set(refs ?? [])].slice(0, 6);
