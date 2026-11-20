import { checkWorkbook, MAX_BYTES } from './workbook.js';
import { SnapshotService, snapshotId } from './snapshot.service.js';

const sheet = {
  id: 's1',
  name: 'By office',
  mark: 'auto',
  query: {
    source: 'aip-programs',
    documents: [{ kind: 'aip', years: [2027] }],
    dimensions: ['office'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [],
  },
};

describe('snapshot ids', () => {
  it('are the same for the same workbook, whatever the key order or extra keys', () => {
    const a = checkWorkbook({ v: 2, name: 'W', sheets: [sheet], active: 0 });
    const b = checkWorkbook({
      active: 0,
      sheets: [
        { query: sheet.query, mark: 'auto', name: 'By office', id: 's1', x: 1 },
      ],
      name: 'W',
      v: 2,
      junk: '<b>',
    });
    expect(snapshotId(a.workbook!)).toBe(snapshotId(b.workbook!));
    expect(snapshotId(a.workbook!)).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const c = checkWorkbook({ v: 2, name: 'W2', sheets: [sheet], active: 0 });
    expect(snapshotId(c.workbook!)).not.toBe(snapshotId(a.workbook!));
  });

  it('keeps dashboards of its own sheets and refuses any other', () => {
    const wb = (dashboards: unknown, board?: string) =>
      checkWorkbook({
        v: 2,
        name: 'W',
        sheets: [sheet],
        active: 0,
        dashboards,
        board,
      });
    const ok = wb([{ id: 'd1', name: 'Board', sheets: ['s1'], x: 1 }], 'd1');
    expect(ok.workbook?.dashboards).toEqual([
      { id: 'd1', name: 'Board', sheets: ['s1'] },
    ]);
    expect(ok.workbook?.board).toBe('d1');
    expect(wb([{ id: 'd1', name: 'B', sheets: ['nope'] }]).errors).toBeTruthy();
    expect(
      wb([{ id: 'd1', name: 'B', sheets: ['s1', 's1'] }]).errors,
    ).toBeTruthy();
    expect(
      wb([{ id: 'd1', name: 'B', sheets: ['s1'] }], 'd2').errors,
    ).toBeTruthy();
    // None at all is the same workbook (and snapshot id) as before dashboards existed.
    const none = wb([]);
    expect(none.workbook && 'dashboards' in none.workbook).toBe(false);
  });

  it('refuses a workbook over the size cap', () => {
    const big = {
      ...sheet,
      query: { ...sheet.query, dimensions: ['x'.repeat(MAX_BYTES)] },
    };
    expect(
      checkWorkbook({ v: 2, name: 'W', sheets: [big], active: 0 }).errors,
    ).toBeTruthy();
  });
});

describe('SnapshotService.load', () => {
  const serve = (state: unknown) =>
    new SnapshotService(
      {
        explorerSnapshot: { findUnique: () => Promise.resolve({ state }) },
      } as never,
      {} as never,
    ).load('abcdefghijkl');

  it('serves the checked workbook, without stray keys', async () => {
    const { workbook } = await serve({
      v: 2,
      name: 'W',
      sheets: [sheet],
      active: 0,
      junk: '<b>',
    });
    expect(workbook).not.toHaveProperty('junk');
    expect(workbook.sheets[0].id).toBe('s1');
  });

  it('answers 404 for a stored row that is not a workbook', async () => {
    await expect(serve({ v: 2, name: '<script>', sheets: [] })).rejects.toThrow(
      'No such workbook.',
    );
  });
});
