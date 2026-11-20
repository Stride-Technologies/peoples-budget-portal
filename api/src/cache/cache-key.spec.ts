import { cacheKey } from './cache-key.js';

/**
 * A non-deterministic cache key does not throw — it just quietly never hits, and
 * reads as "the cache does not help much" rather than as a bug. These are the
 * invariants that keep that from happening.
 */
describe('cacheKey', () => {
  const P = 'reg:counts:';

  it('keeps the prefix intact so delByPrefix can invalidate the group', () => {
    expect(cacheKey(P, { a: 1 })).toMatch(/^reg:counts:[0-9a-f]{40}$/);
  });

  it('is stable across object key order', () => {
    expect(cacheKey(P, { a: 1, b: 2 })).toBe(cacheKey(P, { b: 2, a: 1 }));
  });

  it('is stable across array order', () => {
    // finishLineIds is a filter set, and a visibility clause's officeId `in`
    // list comes from an unordered findMany — order carries no meaning.
    expect(cacheKey(P, { ids: ['b', 'a', 'c'] })).toBe(
      cacheKey(P, { ids: ['a', 'c', 'b'] }),
    );
  });

  it('treats an absent field and an undefined field as the same query', () => {
    expect(cacheKey(P, { a: 1 })).toBe(cacheKey(P, { a: 1, b: undefined }));
  });

  it('is stable across nested key and array order', () => {
    const one = { visibility: { deletedAt: null, OR: [{ x: 1 }, { y: 2 }] } };
    const two = { visibility: { OR: [{ y: 2 }, { x: 1 }], deletedAt: null } };
    expect(cacheKey(P, one)).toBe(cacheKey(P, two));
  });

  it('separates different filter values', () => {
    expect(cacheKey(P, { cycleId: 'a' })).not.toBe(
      cacheKey(P, { cycleId: 'b' }),
    );
  });

  it('separates different tabs — the aggregate is scoped to the active tab', () => {
    expect(cacheKey(P, { tab: 'ALL' })).not.toBe(
      cacheKey(P, { tab: 'DRAFTS' }),
    );
  });

  it('separates different visibility scopes, so one user cannot read another scope', () => {
    const a = {
      visibility: { deletedAt: null, OR: [{ officeId: { in: ['o1'] } }] },
    };
    const b = {
      visibility: { deletedAt: null, OR: [{ officeId: { in: ['o2'] } }] },
    };
    expect(cacheKey(P, a)).not.toBe(cacheKey(P, b));
  });

  it('does not collide an absent field with an explicit null', () => {
    expect(cacheKey(P, { a: null })).not.toBe(cacheKey(P, {}));
  });

  it('distinguishes a string from a number of the same digits', () => {
    expect(cacheKey(P, { page: 1 })).not.toBe(cacheKey(P, { page: '1' }));
  });

  it('separates the two prefixes for identical parts', () => {
    expect(cacheKey('reg:counts:', { a: 1 })).not.toBe(
      cacheKey('pub:registry:', { a: 1 }),
    );
  });
});
