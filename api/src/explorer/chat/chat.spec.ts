import { CAT } from '../test-catalogue.js';
import type { Query } from '../query/query.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../../generated/prisma/index';
import { CHAT_PROMPT_VERSION } from './chat.service.js';
import {
  CHAT_SCHEMA,
  drivers,
  pesoChange,
  unusedFacts,
  fill,
  hasOwnDigits,
  nextSteps,
  parseStep,
  peso,
  percent,
  soleOption,
  tidy,
} from './chat.js';

const q: Query = {
  source: 'aip-programs',
  documents: [{ kind: 'aip', years: [2027] }],
  dimensions: ['subLabel'],
  measures: [{ field: 'amount', agg: 'sum' }],
  filters: [{ field: 'label', op: 'in', values: ['infrastructure'] }],
};

describe('chat core', () => {
  it('peso and percent come from decimal strings', () => {
    expect(peso('2870000000.00')).toBe('₱2.87B');
    expect(peso('640204000.50')).toBe('₱640.20M');
    expect(peso('85000')).toBe('₱85,000.00');
    expect(percent('2870000000', '8070000000')).toBe('36%');
    expect(percent('5', '100')).toBe('5.0%');
    expect(percent('1', '0')).toBeUndefined();
  });

  it('a sentence may name the years asked about, never a figure of its own (W26)', () => {
    expect(hasOwnDigits('In FY2027, {total} goes to roads.', [2027])).toBe(
      false,
    );
    expect(hasOwnDigits('About 36% goes to roads.', [2027])).toBe(true);
    expect(hasOwnDigits('In 2019 roads got {total}.', [2027])).toBe(true);
    const facts = { total: '₱2.87B', share: '36%' };
    expect(fill('{total} ({share}) of FY2027', facts, [2027])).toBe(
      '₱2.87B (36%) of FY2027',
    );
    expect(fill('{total} across {count} PPAs', facts, [2027])).toBeNull(); // a fact the engine did not give
    expect(fill('₱3B for roads', facts, [2027])).toBeNull();
  });

  it('next steps: sub-labels under a label, offices, years; never a step already on screen', () => {
    const ids = nextSteps(q, { ...CAT, documents: [...CAT.documents] }).map(
      (s) => s.id,
    );
    expect(ids[0]).toBe('office'); // subLabel is already the breakdown
    expect(ids).not.toContain('subLabel');
    const byOffice = nextSteps({ ...q, dimensions: ['office'] }, CAT).map(
      (s) => s.id,
    );
    expect(byOffice[0]).toBe('subLabel');
  });

  it('parseStep keeps what the schema allows and drops the rest', () => {
    const s = parseStep(
      JSON.stringify({
        lang: 'bcl',
        action: 'answer',
        reading: 'Showing FY2027.',
        query: {
          ...q,
          sort: null,
          limit: null,
          filters: [
            { field: 'label', op: 'in', values: ['infrastructure'], text: '' },
          ],
        },
        mark: 'nonsense',
        sentences: ['a', 'b', 'c', 'd'],
        alternatives: [{ label: 'All years', query: null }],
        askBack: null,
        refusal: '',
      }),
    );
    expect(s.lang).toBe('bcl');
    expect(s.mark).toBe('auto');
    expect(s.sentences).toHaveLength(3);
    expect(s.alternatives).toEqual([]);
    expect(s.query?.filters).toEqual([
      { field: 'label', op: 'in', values: ['infrastructure'] },
    ]);
    expect(s.query?.sort).toBeUndefined();
  });
});

describe('tidy', () => {
  it('a topic becomes the label of the same id; one label by label becomes by sub-label', () => {
    const t = tidy(
      {
        ...q,
        dimensions: ['topic'],
        filters: [
          { field: 'topic', op: 'in', values: ['infrastructure', 'planning'] },
        ],
      },
      CAT,
    );
    expect(t.filters).toEqual([
      { field: 'label', op: 'in', values: ['infrastructure'] },
    ]);
    expect(t.dimensions).toEqual(['subLabel']);
    expect(
      tidy({ ...q, dimensions: ['label'], filters: [] }, CAT).dimensions,
    ).toEqual(['label']);
  });
});

describe('tidy: labels named in words', () => {
  it('a contains on label becomes its ids; a sub-label written as a label moves; a lone theme gets its sub-labels', () => {
    const t = tidy(
      {
        ...q,
        dimensions: [],
        filters: [
          { field: 'label', op: 'contains', text: 'Infrastructure' },
          { field: 'label', op: 'in', values: ['drainage-flood'] },
        ],
      },
      CAT,
    );
    expect(t.filters).toEqual([
      { field: 'label', op: 'in', values: ['infrastructure'] },
      {
        field: 'subLabel',
        op: 'in',
        values: ['infrastructure.drainage-flood'],
      },
    ]);
    expect(t.dimensions).toEqual(['subLabel']);
  });
});

describe('soleOption', () => {
  const step = {
    lang: 'en' as const,
    action: 'askBack' as const,
    reading: '',
    query: null,
    mark: 'auto' as const,
    sentences: [],
    alternatives: [],
    refusal: '',
  };
  it('an ask-back with one option answers it; two options stay a question', () => {
    const one = soleOption({
      ...step,
      askBack: { question: 'Which?', options: [{ label: 'FY2026', query: q }] },
    });
    expect([one.action, one.query, one.reading, one.askBack]).toEqual([
      'answer',
      q,
      'FY2026',
      null,
    ]);
    const two = {
      ...step,
      askBack: {
        question: 'Which?',
        options: [
          { label: 'a', query: q },
          { label: 'b', query: q },
        ],
      },
    };
    expect(soleOption(two)).toBe(two);
  });
});

describe('specs/020 A5: the new marks reach the chat', () => {
  it('the schema offers kpi, map and words, and the prompt in use describes them', () => {
    const marks = CHAT_SCHEMA.schema.properties.mark.enum as string[];
    for (const m of ['kpi', 'map', 'words']) expect(marks).toContain(m);
    expect(CHAT_PROMPT_VERSION).toBe('chat.v3');
    const prompt = readFileSync(
      join(__dirname, '..', 'prompts', `${CHAT_PROMPT_VERSION}.md`),
      'utf8',
    );
    for (const m of ['`kpi`', '`map`', '`words`', 'perCapita'])
      expect(prompt).toContain(m);
  });
});

describe('drivers and unused facts (specs/020 B2.2, B2.3)', () => {
  const k = (year: number, code: string | null, label = code ?? '') => [
    { code: String(year), label: String(year) },
    { code, label },
  ];
  const rows = [
    { keys: k(2026, 'CEO', 'City Engineer'), values: ['100.00'] },
    { keys: k(2027, 'CEO', 'City Engineer'), values: ['400.00'] },
    { keys: k(2026, 'CHO', 'City Health'), values: ['300.00'] },
    { keys: k(2027, 'CHO', 'City Health'), values: ['250.00'] },
    { keys: k(2027, 'NEW', 'New Office'), values: ['80.00'] },
    { keys: k(2026, 'SAME'), values: ['5.00'] },
    { keys: k(2027, 'SAME'), values: ['5.00'] },
    { keys: k(2027, null, 'Not specified'), values: ['999.00'] },
    { keys: k(2025, 'CEO'), values: ['1.00'] },
  ];

  it('ranks groups by absolute change between the two years, gaps and unchanged left out', () => {
    const d = drivers(rows, [2026, 2027]);
    expect(d.map((x) => [x.code, x.change.toFixed(2)])).toEqual([
      ['CEO', '300.00'],
      ['NEW', '80.00'],
      ['CHO', '-50.00'],
    ]);
  });

  it('writes a signed peso change from decimals', () => {
    expect(pesoChange(new Prisma.Decimal('12400000'))).toBe('+₱12.40M');
    expect(pesoChange(new Prisma.Decimal('-3100000'))).toBe('−₱3.10M');
  });

  it('lists the facts no kept sentence uses', () => {
    expect(
      unusedFacts(['{total} rose {change}.', 'Mostly {driver1}.'], {
        total: '₱1B',
        change: '+5%',
        driver1: 'CEO',
        'driver1.change': '+₱1M',
        count: '3',
      }),
    ).toEqual(['driver1.change', 'count']);
  });
});
