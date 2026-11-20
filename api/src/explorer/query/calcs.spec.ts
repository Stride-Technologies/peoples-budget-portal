import { applyCalcs } from './calcs.js';

const r = (keys: (string | null)[], v: string) => ({ keys, values: [v] });

describe('applyCalcs', () => {
  it('share of the total, as a 4-decimal ratio; none where there is no total', () => {
    const rows = [r(['CEO'], '300.00'), r(['CHO'], '100.00')];
    expect(
      applyCalcs(
        rows,
        [{ type: 'percentOfTotal', measure: 0 }],
        ['office'],
        ['400.00'],
      ),
    ).toEqual([['0.7500'], ['0.2500']]);
    expect(
      applyCalcs(
        rows,
        [{ type: 'percentOfTotal', measure: 0 }],
        ['office'],
        null,
      ),
    ).toEqual([[null], [null]]);
  });

  it('change from the previous year, per partition, whatever order the rows come in', () => {
    const rows = [
      r(['2027', 'aip'], '565.27'),
      r(['2026', 'aip'], '61.64'),
      r(['2023', 'lep'], '48.29'),
      r(['2024', 'lep'], '73.71'),
    ];
    const out = applyCalcs(
      rows,
      [
        { type: 'differenceFromPrevious', measure: 0 },
        { type: 'percentDifferenceFromPrevious', measure: 0 },
      ],
      ['year', 'kind'],
      null,
    );
    expect(out).toEqual([
      ['503.63', '8.1705'], // AIP 2026 → 2027
      [null, null], // first AIP year
      [null, null], // first LEP year
      ['25.42', '0.5264'], // LEP 2023 → 2024; never across kinds
    ]);
  });

  it('ranks with ties sharing a place, and runs a total along the years', () => {
    const rows = [r(['a'], '5'), r(['b'], '9'), r(['c'], '5'), r(['d'], '1')];
    expect(
      applyCalcs(rows, [{ type: 'rank', measure: 0 }], ['x'], null).flat(),
    ).toEqual(['2', '1', '2', '4']);
    const years = [
      r(['2025'], '10.00'),
      r(['2023'], '1.50'),
      r(['2024'], '2.25'),
    ];
    expect(
      applyCalcs(
        years,
        [{ type: 'runningTotal', measure: 0 }],
        ['year'],
        null,
      ).flat(),
    ).toEqual(['13.75', '1.50', '3.75']);
  });
});
