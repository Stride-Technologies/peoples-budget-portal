import { relinkTo, type SourcedItem } from './ppmp-relink.js';

const item = (
  id: string,
  src: Partial<Omit<SourcedItem, 'id'>> = {},
): SourcedItem => ({
  id,
  sourceProgramId: null,
  sourceProjectActivityId: null,
  sourceItemId: null,
  ...src,
});

describe('relinkTo (specs/012 D9)', () => {
  it('follows a direct source link first', () => {
    const ord = [item('o1', { sourceProjectActivityId: 'pa1' }), item('pa1')];
    expect(relinkTo({ projectActivityId: 'pa1' }, ord, [])).toEqual({
      budgetItemId: 'o1',
    });
  });

  it('follows AIP → LEP → Ordinance', () => {
    const lep = [item('l1', { sourceProgramId: 'p1' })];
    const ord = [item('o1', { sourceItemId: 'l1' }), item('o2')];
    expect(relinkTo({ programId: 'p1' }, ord, lep)).toEqual({
      budgetItemId: 'o1',
    });
  });

  it('falls back to a reused id (the FY2026 re-import)', () => {
    expect(relinkTo({ programId: 'p1' }, [item('p1')], [])).toEqual({
      budgetItemId: 'p1',
    });
  });

  it('does not mistake a program link for a PA link', () => {
    const ord = [item('o1', { sourceProjectActivityId: 'x' })];
    expect(relinkTo({ programId: 'x' }, ord, [])).toEqual({
      budgetItemId: null,
      reason: 'none',
    });
  });

  it('leaves a split row for the office to choose', () => {
    const ord = [
      item('o1', { sourceProjectActivityId: 'pa1' }),
      item('o2', { sourceProjectActivityId: 'pa1' }),
    ];
    expect(relinkTo({ projectActivityId: 'pa1' }, ord, [])).toEqual({
      budgetItemId: null,
      reason: 'several',
    });
  });
});
