import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FundSource } from '../generated/prisma/index';
import { THEMATIC_TAGS } from '../../prisma/data/thematic-tags';
import {
  compileTopic,
  RULE_KINDS,
  withoutTopicOverlap,
  type RowCodes,
} from './topics.js';

const row = (o: Partial<RowCodes>): RowCodes => ({
  office: '_none',
  cluster: '_none',
  sector: '_none',
  finishLine: '_none',
  themes: [],
  funds: [],
  label: '',
  ...o,
});

describe('compileTopic', () => {
  const agri = compileTopic([
    { kind: 'office', value: 'CAgO' },
    { kind: 'fund', value: 'SEF' },
    { kind: 'theme', value: 'youth' },
    { kind: 'keyword', value: '\\b(farm|fisher)' },
  ]);

  it('matches on any rule', () => {
    expect(agri(row({ office: 'CAgO' }))).toBe(true);
    expect(agri(row({ funds: ['GF', 'SEF'] }))).toBe(true);
    expect(agri(row({ themes: ['youth'] }))).toBe(true);
    expect(agri(row({ label: 'Support to Fisherfolk' }))).toBe(true);
  });

  it('keywords match at a word start, case-insensitive', () => {
    expect(agri(row({ label: 'FARM-to-market road' }))).toBe(true);
    expect(agri(row({ label: 'Pharmacy supplies' }))).toBe(false);
  });

  it('matches nothing else', () => {
    expect(agri(row({ office: 'CHO', label: 'Clinic' }))).toBe(false);
  });
});

/**
 * The draft topics name real codes: a renamed office, cluster or tag would
 * otherwise drop out of a topic without a sound (W16).
 */
describe('prisma/data/explorer-topics.json', () => {
  const data = (f: string) =>
    readFileSync(join(__dirname, '..', '..', 'prisma', 'data', f), 'utf8');
  const { topics } = JSON.parse(data('explorer-topics.json')) as {
    topics: { id: string; rules: [string, string][] }[];
  };
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
  const known: Record<string, Set<string>> = {
    office: new Set(
      (
        JSON.parse(data('sample-city/offices.json')) as { acronym: string }[]
      ).map((o) => o.acronym),
    ),
    cluster: new Set(
      (JSON.parse(data('sample-city/clusters.json')) as { name: string }[]).map(
        (c) => slug(c.name),
      ),
    ),
    fund: new Set(Object.values(FundSource)),
    theme: new Set(THEMATIC_TAGS.map(slug)),
  };

  it.each(topics.map((t) => [t.id, t.rules] as const))(
    '%s: every rule is a known kind and code',
    (_id, rules) => {
      for (const [kind, value] of rules) {
        expect(RULE_KINDS).toContain(kind);
        if (kind === 'keyword')
          expect(() => new RegExp(value, 'i')).not.toThrow();
        else if (known[kind]) expect([...known[kind]]).toContain(value);
      }
    },
  );
});

describe('withoutTopicOverlap', () => {
  const rules = {
    youth: [
      { kind: 'office' as const, value: 'CMO-NCYDO' },
      { kind: 'theme' as const, value: 'youth' },
    ],
  };
  const v = (filters: Record<string, string[]>) => ({
    v: 1 as const,
    series: [
      {
        document: 'aip' as const,
        years: [2027],
        measure: 'money' as const,
        filters,
      },
    ],
    groupBy: 'office' as const,
    chart: 'bar' as const,
  });

  it('drops filters the topic already covers (dev: youth showed nothing)', () => {
    expect(
      withoutTopicOverlap(
        v({ office: ['CMO-NCYDO'], theme: ['youth'], topic: ['youth'] }),
        rules,
      ).series[0].filters,
    ).toEqual({ topic: ['youth'] });
  });

  it('keeps a filter that narrows to something outside the topic', () => {
    expect(
      withoutTopicOverlap(
        v({ office: ['CMO-NCYDO', 'CHO'], fund: ['GF'], topic: ['youth'] }),
        rules,
      ).series[0].filters,
    ).toEqual({ office: ['CMO-NCYDO', 'CHO'], fund: ['GF'], topic: ['youth'] });
  });
});
