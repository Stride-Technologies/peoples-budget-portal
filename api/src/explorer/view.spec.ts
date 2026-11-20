import { CAT } from './test-catalogue.js';
import {
  defaultView,
  parseViewQuery,
  validateView,
  viewToQuery,
  type ExplorerView,
} from './view.js';

describe('parseViewQuery', () => {
  it('reads the URL grammar, global and per-series filters', () => {
    const { view, errors } = parseViewQuery({
      s: ['aip:2027,2026:money:Plan', 'ordinance:2026:count'],
      f: 'office:CHO,CPDO',
      f1: 'fund:GF',
      by: 'year',
      chart: 'line',
      top: '5',
    });
    expect(errors).toEqual([]);
    expect(view).toEqual<ExplorerView>({
      v: 1,
      series: [
        {
          document: 'aip',
          years: [2027, 2026],
          measure: 'money',
          filters: { office: ['CHO', 'CPDO'] },
          label: 'Plan',
        },
        {
          document: 'ordinance',
          years: [2026],
          measure: 'count',
          filters: { office: ['CHO', 'CPDO'], fund: ['GF'] },
        },
      ],
      groupBy: 'year',
      chart: 'line',
      top: 5,
    });
  });

  it('defaults to money, sector and bar, and names every grammar error by path', () => {
    const { view, errors } = parseViewQuery({ s: 'aip:2027' });
    expect(errors).toEqual([]);
    expect(view.series[0].measure).toBe('money');
    expect(view.groupBy).toBe('sector');
    expect(view.chart).toBe('bar');
    const bad = parseViewQuery({
      s: 'lep2:x',
      f: 'colour:red',
      by: 'mood',
      chart: 'pie',
      top: '0',
      f3: 'fund:GF',
    });
    expect(bad.errors.map((e) => e.code).sort()).toEqual(
      [
        'bad-top',
        'no-series',
        'no-such-series',
        'unknown-chart',
        'unknown-dimension',
        'unknown-document',
        'unknown-group-by',
      ].sort(),
    );
  });

  it('round-trips through viewToQuery', () => {
    const { view } = parseViewQuery({
      s: ['aip:2027:money', 'ordinance:2026:money'],
      f0: 'sector:3000',
      by: 'office',
      chart: 'bar',
      top: '8',
    });
    const again = parseViewQuery(
      Object.fromEntries(
        [...viewToQuery(view).entries()].reduce<Map<string, string[]>>(
          (m, [k, v]) => m.set(k, [...(m.get(k) ?? []), v]),
          new Map(),
        ),
      ),
    );
    expect(again.view).toEqual(view);
  });
});

describe('validateView', () => {
  const base = (over: Partial<ExplorerView> = {}): ExplorerView => ({
    v: 1,
    series: [{ document: 'aip', years: [2027], measure: 'money', filters: {} }],
    groupBy: 'sector',
    chart: 'bar',
    ...over,
  });
  const codes = (v: ExplorerView) => validateView(v, CAT).map((e) => e.code);

  it('accepts a plain single-year view', () => {
    expect(codes(base())).toEqual([]);
  });

  it('refuses a year that is not public (R6)', () => {
    expect(
      codes(
        base({
          series: [
            { document: 'lep', years: [2026], measure: 'money', filters: {} },
          ],
        }),
      ),
    ).toEqual(['year-not-public']);
  });

  it('refuses stacking across document kinds (R9) and across themes (R12)', () => {
    const mixed = base({
      chart: 'stackedBar',
      series: [
        { document: 'aip', years: [2026], measure: 'money', filters: {} },
        { document: 'ordinance', years: [2026], measure: 'money', filters: {} },
      ],
    });
    expect(codes(mixed)).toEqual(['no-stack-across-kinds']);
    expect(codes(base({ chart: 'stackedBar', groupBy: 'theme' }))).toEqual([
      'no-stack-themes',
    ]);
  });

  it('ties years to the breakdown: by-year needs two, otherwise one per series; line needs by-year', () => {
    expect(codes(base({ groupBy: 'year' }))).toEqual(['need-two-years']);
    expect(
      codes(
        base({
          series: [
            {
              document: 'aip',
              years: [2027, 2026],
              measure: 'money',
              filters: {},
            },
          ],
        }),
      ),
    ).toEqual(['one-year-per-series']);
    expect(codes(base({ chart: 'line' }))).toEqual(['line-needs-years']);
  });

  it('refuses a count by expense class or fund, and unknown filter values', () => {
    expect(
      codes(
        base({
          groupBy: 'fund',
          series: [
            { document: 'aip', years: [2027], measure: 'count', filters: {} },
          ],
        }),
      ),
    ).toEqual(['count-has-no-class']);
    expect(
      codes(
        base({
          series: [
            {
              document: 'aip',
              years: [2027],
              measure: 'money',
              filters: { office: ['NOPE'] },
            },
          ],
        }),
      ),
    ).toEqual(['unknown-value']);
  });

  it('defaults to the latest AIP by sector', () => {
    expect(defaultView(CAT)).toEqual(base());
  });
});
