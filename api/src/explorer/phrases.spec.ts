import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAT } from './test-catalogue.js';
import { aliasHits } from './match.js';
import {
  compoundPattern,
  masker,
  norm,
  stopWords,
  type Compound,
} from './phrases.js';
import {
  compileTopic,
  topicsOf,
  type RowCodes,
  type TopicRule,
} from './topics.js';

const data = <T>(f: string) =>
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'prisma', 'data', f), 'utf8'),
  ) as T;
const COMPOUNDS = data<{ compounds: Compound[] }>(
  'explorer-compounds.json',
).compounds;
const TOPICS = Object.fromEntries(
  data<{ topics: { id: string; rules: [TopicRule['kind'], string][] }[] }>(
    'explorer-topics.json',
  ).topics.map((t) => [
    t.id,
    t.rules.map(([kind, value]) => ({ kind, value })),
  ]),
);

const codes = (label: string): RowCodes => ({
  office: '_none',
  cluster: '_none',
  sector: '_none',
  finishLine: '_none',
  themes: [],
  funds: [],
  label,
});
const topics = (name: string, compounds = COMPOUNDS) =>
  topicsOf(TOPICS, () => codes(name), compounds)({} as never);

describe('compounds (specs/020, decision #16)', () => {
  it('match whole words in order, across spaces or a hyphen, without accents', () => {
    const re = compoundPattern('capacity building');
    expect(norm('Capacity-Building of Workforce').match(re)).toBeTruthy();
    expect(norm('capacity of the building').match(re)).toBeNull();
    expect(
      norm('Capacity Buildings').match(compoundPattern('capacity building')),
    ).toBeNull();
  });

  it('blank only for the ids they name', () => {
    const mask = masker([
      { phrase: 'technical assistance', not: ['social-welfare'] },
    ]);
    expect(
      mask('social-welfare', 'Technical Assistance to Barangays'),
    ).not.toMatch(/assistance/);
    expect(mask('agriculture', 'Technical Assistance to Barangays')).toBe(
      'Technical Assistance to Barangays',
    );
  });

  it.each([
    [
      'Personnel Trainings and Capacity Building of Workforce',
      'infrastructure',
    ],
    [
      'Budget Planning, Investment Programming, and PPMP Preparation Services',
      'livelihood-jobs',
    ],
    ['Technical Assistance to the 27 Barangays', 'social-welfare'],
    [
      'Disaster Recovery Center and Automated Data Replication',
      'disaster-risk',
    ],
    ['Cybersecurity Infrastructure Hardening', 'infrastructure'],
  ])('%s is not %s any more', (name, topic) => {
    expect(topics(name, [])).toContain(topic); // the bare keyword would say so
    expect(topics(name)).not.toContain(topic);
  });

  it.each([
    ['Multi-Purpose Building, Bgy. Hall Cmpd., Calauag', 'infrastructure'],
    ['Post-Disaster Recovery Capacity Building Project', 'disaster-risk'],
    [
      'Capacity Building and Construction of Evacuation Centers',
      'infrastructure',
    ],
    ['Financial Assistance to Indigent Families', 'social-welfare'],
  ])('%s is still %s', (name, topic) => {
    expect(topics(name)).toContain(topic);
  });

  it('every reviewed compound is well formed', () => {
    const ids = new Set([
      ...Object.keys(TOPICS),
      ...data<{ labels: { id: string }[] }>('explorer-labels.json').labels.map(
        (l) => l.id,
      ),
    ]);
    for (const c of COMPOUNDS) {
      expect(norm(c.phrase).trim().split(/\s+/).length).toBeGreaterThanOrEqual(
        2,
      );
      for (const id of c.not) expect(ids).toContain(id);
      if (c.not.length) expect(c.why).toBeTruthy();
    }
    expect(new Set(COMPOUNDS.map((c) => norm(c.phrase).trim())).size).toBe(
      COMPOUNDS.length,
    );
  });

  it("keep a question's alias inside a compound from firing", () => {
    const cat = {
      ...CAT,
      version: 'compounds-test',
      dimensions: {
        ...CAT.dimensions,
        label: CAT.dimensions.label.map((v) =>
          v.id === 'health' ? { ...v, aliases: { en: ['assistance'] } } : v,
        ),
      },
      compounds: [
        { phrase: 'technical assistance', not: ['health'], why: 'test' },
      ],
    };
    expect(aliasHits('medical assistance for seniors', cat)).toContain(
      'label:health',
    );
    expect(aliasHits('technical assistance to barangays', cat)).not.toContain(
      'label:health',
    );
  });
});

describe('compileTopic with a mask', () => {
  it('tests keywords on the masked name', () => {
    const t = compileTopic([{ kind: 'keyword', value: '\\bbuilding' }], (s) =>
      s.replace(/capacity building/i, ''),
    );
    expect(t(codes('Capacity Building'))).toBe(false);
    expect(t(codes('School Building'))).toBe(true);
  });
});

describe('stopWords', () => {
  it("adds the LGU's own name, folded the way row names are", () => {
    const stop = stopWords('Piñan de Oro');
    expect(['pinan', 'oro', 'city', 'ng'].every((w) => stop.has(w))).toBe(true);
    expect(stop.has('drainage')).toBe(false);
    expect(stopWords().has('pinan')).toBe(false);
  });
});
