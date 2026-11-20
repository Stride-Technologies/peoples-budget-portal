import 'server-only';
import { SITE_URL } from '@/lib/seo';
import { HEARINGS_API_URL } from './config';
import {
  SUMMARY_LANGS,
  safeId,
  withReviewed,
  type Councilor,
  type CouncilorAction,
  type DocumentLink,
  type GlossaryEntry,
  type Goals,
  type HearingsSite,
  type Segment,
  type SessionEntry,
  type Summary,
  type SummaryLang,
} from './format';

/**
 * Reads of the hearings API: a folder of JSON files and two JSON endpoints, public and read-only
 * (docs/hearings-api.md). Every read is cached for five minutes and answers null when the API is
 * down, a file is missing or the body is not JSON: a page shows what it has, never an error page
 * for a file one session lacks.
 */
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${HEARINGS_API_URL}/${path}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
      // Say who is asking: an API may turn away programs it takes for scrapers, by name.
      headers: { 'User-Agent': `peoples-budget-portal (hearings pages; ${SITE_URL})` },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
const list = <T>(v: T[] | null): T[] => (Array.isArray(v) ? v : []);

/** Every published session, newest first as the API lists them. Entries without a usable id are dropped. */
export async function loadIndex(): Promise<SessionEntry[]> {
  return list(await get<SessionEntry[]>('sessions/index.json')).filter(
    (s) => safeId(s?.id) && typeof s.title === 'string',
  );
}
export const loadSite = () => get<HearingsSite>('hearings.json');
export const loadRoster = async () => list(await get<Councilor[]>('councilors.json')).filter((c) => safeId(c?.slug));
export const loadGlossary = async () => list(await get<GlossaryEntry[]>('glossary.json'));
export async function loadGoals(): Promise<Goals> {
  const g = await get<Goals>('portal.json');
  return { finishLines: g?.finishLines ?? {}, clusters: list(g?.clusters ?? null) };
}

/** A session's lines, with reviewers' corrections laid over the machine's text. */
export async function loadSegments(id: string): Promise<Segment[] | null> {
  const [file, reviewed] = await Promise.all([
    get<{ segments: Segment[] }>(`sessions/${id}.json`),
    get<{ seg_idx: number; text: string }[]>(`api/sessions/${id}/reviewed`),
  ]);
  return file && Array.isArray(file.segments) ? withReviewed(file.segments, list(reviewed)) : null;
}
export const loadLinks = async (id: string) => list(await get<DocumentLink[]>(`sessions/${id}.links.json`));

const summaryPath = (id: string, lang: SummaryLang) => `sessions/${id}.summary${lang === 'en' ? '' : `.${lang}`}.json`;
const usable = (s: Summary | null): s is Summary => !!s && Array.isArray(s.glance) && Array.isArray(s.sections) && Array.isArray(s.issues);

/** One summary: in `lang` when the API has it, else in English, else null. */
export async function loadSummary(id: string, lang: SummaryLang = 'en'): Promise<Summary | null> {
  const wanted = lang === 'en' ? null : await get<Summary>(summaryPath(id, lang));
  if (usable(wanted)) return wanted;
  const english = await get<Summary>(summaryPath(id, 'en'));
  return usable(english) ? english : null;
}
/** Every language's summary of one session, for the session page's language picker. */
export async function loadSummaries(id: string): Promise<Partial<Record<SummaryLang, Summary>>> {
  const all = await Promise.all(SUMMARY_LANGS.map((l) => get<Summary>(summaryPath(id, l))));
  return Object.fromEntries(SUMMARY_LANGS.flatMap((l, i) => (usable(all[i]) ? [[l, all[i]]] : [])));
}
export const loadActions = async (slug: string) =>
  list(await get<CouncilorAction[]>(`api/councilors/${encodeURIComponent(slug)}/actions`)).filter((a) => safeId(a?.session_id));
