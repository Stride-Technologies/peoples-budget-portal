'use server';

import {
  apiExploreAsk,
  apiExploreChat,
  apiExploreFeedback,
  apiExploreQuery,
  apiExploreRows,
  apiExploreSaveSnapshot,
  apiExploreTranscribe,
  apiExploreView,
  type ExploreAskResult,
  type ExploreChatResult,
  type QueryRows,
} from '@/lib/api';
import type { QueryResult } from '@/lib/explore/compile';
import type { Workbook, WorkbookQuery } from '@/lib/explore/workbook';
import { visitorIp } from '@/lib/visitor-ip';

// Through the server so the API's rate limits key on the visitor (lib/visitor-ip).

export async function sendExplainFeedback(
  dto: Parameters<typeof apiExploreFeedback>[0],
): Promise<{ ok: boolean }> {
  try {
    await apiExploreFeedback(dto, await visitorIp());
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function askExplorer(
  dto: Parameters<typeof apiExploreAsk>[0],
): Promise<ExploreAskResult | { error: 'limit' | 'failed' }> {
  try {
    return await apiExploreAsk(dto, await visitorIp());
  } catch (e) {
    return { error: (e as { statusCode?: number }).statusCode === 429 ? 'limit' : 'failed' };
  }
}

export async function chatExplorer(
  dto: Parameters<typeof apiExploreChat>[0],
): Promise<ExploreChatResult | { error: 'limit' | 'failed' }> {
  try {
    return await apiExploreChat(dto, await visitorIp());
  } catch (e) {
    return { error: (e as { statusCode?: number }).statusCode === 429 ? 'limit' : 'failed' };
  }
}

/** `form`: `audio` (the clip), `lang`, `deviceKey`. */
export async function transcribeQuestion(form: FormData): Promise<{ text: string } | { error: 'limit' | 'failed' }> {
  try {
    const { text } = await apiExploreTranscribe(form, await visitorIp());
    return { text };
  } catch (e) {
    return { error: (e as { statusCode?: number }).statusCode === 429 ? 'limit' : 'failed' };
  }
}

/**
 * The filters sheet's live count (T014): what "Show chart" would show for a
 * draft, before it is applied. The first series only, which is the one the
 * sheet's filters apply to.
 */
export async function previewView(query: string): Promise<{ n: number; total: string | null; measure: 'money' | 'count' } | null> {
  try {
    const r = await apiExploreView(new URLSearchParams(query), await visitorIp());
    const s = r.series[0];
    return s ? { n: s.n, total: s.total, measure: s.measure } : null;
  } catch {
    return null;
  }
}

/** The workspace's chart data: the query engine's answer, or its reasons. */
export async function runQuery(
  query: WorkbookQuery,
): Promise<{ result: QueryResult } | { error: 'limit' | 'failed' | 'invalid'; errors?: string[] }> {
  try {
    return { result: await apiExploreQuery(query, await visitorIp()) };
  } catch (e) {
    const err = e as { statusCode?: number; body?: { errors?: { message: string }[] } };
    if (err.statusCode === 429) return { error: 'limit' };
    if (err.statusCode === 400) return { error: 'invalid', errors: err.body?.errors?.map((x) => x.message) };
    return { error: 'failed' };
  }
}

/** The Records view: one page of the rows behind a sheet. */
export async function runRows(query: WorkbookQuery, offset: number): Promise<{ rows: QueryRows } | { error: 'limit' | 'failed' }> {
  try {
    return { rows: await apiExploreRows({ query, offset, size: 50 }, await visitorIp()) };
  } catch (e) {
    return { error: (e as { statusCode?: number }).statusCode === 429 ? 'limit' : 'failed' };
  }
}

/** Share: store the workbook once (same workbook, same id) and return its id. */
export async function saveSnapshot(workbook: Workbook): Promise<{ id: string } | { error: 'limit' | 'failed' }> {
  try {
    return await apiExploreSaveSnapshot(workbook, await visitorIp());
  } catch (e) {
    return { error: (e as { statusCode?: number }).statusCode === 429 ? 'limit' : 'failed' };
  }
}
