import type { CatalogueDocument } from './catalogue.service.js';
import { fitYearsToKinds, preferNamedTopics } from './view-repair.js';
import type { ExplorerView } from './view.js';

const doc = (kind: CatalogueDocument['kind'], year: number) =>
  ({ kind, year }) as CatalogueDocument;
// As on dev with drafts on: AIP 2026–27, LEP 2023–26, ordinance 2026.
const documents = [
  doc('aip', 2027),
  doc('aip', 2026),
  doc('lep', 2026),
  doc('lep', 2025),
  doc('lep', 2024),
  doc('lep', 2023),
  doc('ordinance', 2026),
];

const view = (
  series: Partial<ExplorerView['series'][number]>[],
  over: Partial<ExplorerView> = {},
): ExplorerView => ({
  v: 1,
  series: series.map((s) => ({
    document: 'aip',
    years: [2027],
    measure: 'money',
    filters: {},
    ...s,
  })),
  groupBy: 'year',
  chart: 'line',
  ...over,
});
const shape = (v: ExplorerView) =>
  v.series.map((s) => `${s.document}:${s.years.join(',')}`);

describe('fitYearsToKinds', () => {
  it('spreads the named years over the kinds that have them (dev: AIP 2023 was refused)', () => {
    const v = view([
      {
        years: [2023, 2024, 2025, 2026, 2027],
        filters: { office: ['CHO'] },
        label: 'CHO 2023–2027',
      },
    ]);
    const out = fitYearsToKinds(v, { documents }, 'CHO from 2023 to 2027');
    expect(shape(out)).toEqual(['aip:2026,2027', 'lep:2023,2024,2025,2026']);
    expect(out.series[1].filters).toEqual({ office: ['CHO'] });
    expect(out.series[0].label).toBeUndefined();
  });

  it('"over the years" runs over every kind with two or more years, AIP first', () => {
    const out = fitYearsToKinds(
      view([{ years: [2026, 2027] }]),
      { documents },
      'disaster spending over the years',
    );
    expect(shape(out)).toEqual(['aip:2026,2027', 'lep:2023,2024,2025,2026']);
  });

  it('adds no kind the named years do not need', () => {
    const out = fitYearsToKinds(
      view([{ years: [2026, 2027] }]),
      { documents },
      'AIP 2026 vs 2027',
    );
    expect(shape(out)).toEqual(['aip:2026,2027']);
  });

  it('leaves a view that is not by year alone', () => {
    const v = view([{ years: [2027] }], { groupBy: 'office', chart: 'bar' });
    expect(fitYearsToKinds(v, { documents }, 'over the years')).toBe(v);
  });
});

describe('preferNamedTopics', () => {
  const topicRules = {
    youth: [
      { kind: 'theme' as const, value: 'youth' },
      { kind: 'office' as const, value: 'CMO-NCYDO' },
    ],
  };
  const named = [{ dim: 'topic', id: 'youth', via: 'alias' as const }];

  it('turns a tag the named topic covers into the topic (dev: youth → ₱205K)', () => {
    const out = preferNamedTopics(
      view([{ filters: { theme: ['youth'] } }], { groupBy: 'office' }),
      named,
      { topicRules },
    );
    expect(out.series[0].filters).toEqual({ topic: ['youth'] });
  });

  it('leaves an office filter alone, and does nothing unless the topic was named', () => {
    const v = view([{ filters: { office: ['CMO-NCYDO'] } }]);
    expect(
      preferNamedTopics(v, named, { topicRules }).series[0].filters,
    ).toEqual({ office: ['CMO-NCYDO'] });
    const tag = view([{ filters: { theme: ['youth'] } }]);
    expect(
      preferNamedTopics(tag, [{ ...named[0], via: 'vector' }], { topicRules })
        .series[0].filters,
    ).toEqual({ theme: ['youth'] });
  });
});
