import { createHash } from 'node:crypto';

/**
 * Deterministic serialization for cache keys.
 *
 * Object keys are sorted recursively, and `undefined` properties are dropped so
 * `{ a: 1 }` and `{ a: 1, b: undefined }` collapse to one key.
 *
 * **Arrays are sorted too** — every array this module hashes is a semantically
 * unordered set (filter id lists, and the `OR` branches / `officeId: { in: [...] }`
 * of a Prisma visibility clause). That matters for correctness of the hit rate,
 * not just tidiness: `OfficeScopeService` builds its id list from an unordered
 * `findMany`, so the same user's scope can serialize in a different order after
 * its own cache expires, and an order-sensitive key would silently miss.
 *
 * Do not reuse this for values where array order carries meaning.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).sort().join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}

/**
 * `prefix` + a stable digest of `parts`. Hashing keeps the key bounded no matter
 * how large the filter set gets, while leaving the prefix intact so
 * `CacheService.delByPrefix(prefix)` still invalidates the whole family.
 *
 * Callers should lower-case any value the query matches case-insensitively
 * (Prisma `mode: 'insensitive'`), so `Health` and `health` share one entry.
 */
export function cacheKey(prefix: string, parts: unknown): string {
  return (
    prefix + createHash('sha1').update(stableStringify(parts)).digest('hex')
  );
}
