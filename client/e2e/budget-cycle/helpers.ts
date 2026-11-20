import type { APIRequestContext } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:8000/api/v1';

/** Years the writing specs create and remove (db-fixtures.ts); never a real year. */
export const FIXTURE_YEARS = [2098, 2099];

export interface PublicCycle {
  id: string;
  fiscalYear: number;
  sections: Array<'aip' | 'annual'>;
}

/**
 * The newest public year matching `test`, or undefined. These specs read the
 * database they are pointed at and skip when it has no such year, rather than
 * writing fixtures into it (specs/012 T043).
 */
export async function findYear(
  request: APIRequestContext,
  test: (c: PublicCycle) => boolean,
) {
  const res = await request.get(`${API}/public/cycles`);
  const cycles = (await res.json()) as PublicCycle[];
  return cycles
    .filter((c) => !FIXTURE_YEARS.includes(c.fiscalYear))
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .find(test);
}
