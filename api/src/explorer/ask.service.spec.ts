import { CacheService } from '../cache/cache.service.js';
import { MemoryCacheStore } from '../cache/memory-cache.store.js';
import { AskService } from './ask.service.js';
import type { EmbedPort } from './ports/embed.port.js';
import { ResolveService } from './resolve.service.js';
import type { Catalogue, CatalogueService } from './catalogue.service.js';
import { DeviceLimitError, ExplorerLimits } from './explorer-limits.js';
import type { ExplorerLogService, QuestionRecord } from './log.service.js';
import type {
  Decision,
  DecideInput,
  DecisionPort,
} from './ports/decision.port.js';
import { CAT } from './test-catalogue.js';
import type { ExplorerView } from './view.js';

const view = (over: Partial<ExplorerView> = {}): ExplorerView => ({
  v: 1,
  series: [{ document: 'aip', years: [2027], measure: 'money', filters: {} }],
  groupBy: 'office',
  chart: 'bar',
  ...over,
});
const BAD = view({ chart: 'line' }); // line needs groupBy year

const cat: Catalogue = {
  ...CAT,
  cards: [
    {
      id: 'by-sector',
      tags: ['default', 'budget-exhausted'],
      question: {
        en: 'Where does the 2027 money go, by sector?',
        fil: 'Saan napupunta ang pondo ng 2027, ayon sa sektor?',
      },
      view: view({ groupBy: 'sector' }),
    },
    {
      id: 'stale',
      tags: ['default'],
      question: { en: 'Where did the 2019 money go?' },
      view: view({
        series: [
          { document: 'aip', years: [2019], measure: 'money', filters: {} },
        ],
      }),
    },
  ],
};

const decision = (over: Partial<Decision>): Decision => ({
  view: null,
  guessed: [],
  model: 'test-model',
  promptHash: 'h',
  promptVersion: '1',
  input: { system: 'sys', user: 'q' },
  call: {
    text: '{}',
    model: 'test-model',
    latencyMs: 5,
    tokensIn: 1000,
    tokensOut: 100,
  },
  ...over,
});

function setup(answers: Decision[], embedder: EmbedPort | null = null) {
  const decide = jest.fn<Promise<Decision>, [DecideInput]>();
  for (const a of answers) decide.mockResolvedValueOnce(a);
  const decider: DecisionPort = { decide };
  const records: QuestionRecord[] = [];
  const log = {
    recordQuestion: jest.fn((r: QuestionRecord) => {
      records.push(r);
      return Promise.resolve(`rec-${records.length}`);
    }),
  } as unknown as ExplorerLogService;
  const cache = new CacheService(new MemoryCacheStore());
  const limits = new ExplorerLimits(cache);
  const catalogue = {
    get: () => Promise.resolve(cat),
  } as unknown as CatalogueService;
  return {
    svc: new AskService(
      catalogue,
      cache,
      limits,
      log,
      new ResolveService(catalogue, cache, embedder),
      decider,
    ),
    decide,
    records,
    limits,
  };
}

const ENV = { ...process.env };
beforeEach(() => {
  process.env.EXPLORER_ENABLED = '1';
  process.env.EXPLORER_AI_ENABLED = '1';
  process.env.EXPLORER_DAILY_BUDGET_USD = '5';
  process.env.EXPLORER_DEVICE_SALT = 'salt';
});
afterAll(() => {
  process.env = ENV;
});

describe('AskService ladder', () => {
  it('answers from a card without calling the model', async () => {
    const { svc, decide, records } = setup([]);
    const r = await svc.ask({
      q: 'where does the 2027 money go by sector',
      lang: 'en',
    });
    expect(r.answeredBy).toBe('card');
    expect(r.view?.groupBy).toBe('sector');
    expect(decide).not.toHaveBeenCalled();
    expect(records[0].answeredBy).toBe('card');
  });

  it('matches a card asked in Filipino on an English page', async () => {
    const { svc } = setup([]);
    const r = await svc.ask({
      q: 'Saan napupunta ang pondo ng 2027, ayon sa sektor?',
      lang: 'en',
    });
    expect(r.answeredBy).toBe('card');
    expect(r.lang).toBe('fil');
  });

  it('never matches a card about another year', async () => {
    const { svc, decide } = setup([decision({ view: view() })]);
    const r = await svc.ask({ q: 'Where does the 2026 money go, by sector?' });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(r.answeredBy).toBe('model');
  });

  it('returns a valid model view, then serves the same question from cache', async () => {
    const { svc, decide, records } = setup([
      decision({
        view: view(),
        understood: 'FY2027 AIP by office',
        guessed: ['year'],
      }),
    ]);
    const first = await svc.ask({ q: 'biggest offices?', lang: 'en' });
    expect(first).toMatchObject({
      answeredBy: 'model',
      view: view(),
      guessed: ['year'],
    });
    const again = await svc.ask({ q: '  Biggest   OFFICES ', lang: 'en' });
    expect(again.answeredBy).toBe('cache');
    expect(decide).toHaveBeenCalledTimes(1);
    expect(records[0].decisions?.[0].validated).toEqual(view());
  });

  it('hands the model the values the question names, as hints (W16)', async () => {
    const { svc, decide } = setup([decision({ view: view() })]);
    await svc.ask({ q: 'how much does CHO get?', lang: 'en' });
    expect(decide.mock.calls[0][0].hints).toEqual([
      { dim: 'office', id: 'CHO', label: 'CHO', score: 1, via: 'alias' },
    ]);
  });

  it('does not cache an answer made while the embedding index is down', async () => {
    const down: EmbedPort = {
      model: 'm',
      embed: () => Promise.reject(new Error('401')),
    };
    const { svc, decide } = setup(
      [decision({ view: view() }), decision({ view: view() })],
      down,
    );
    expect((await svc.ask({ q: 'zoning plans', lang: 'en' })).answeredBy).toBe(
      'model',
    );
    expect((await svc.ask({ q: 'zoning plans', lang: 'en' })).answeredBy).toBe(
      'model',
    );
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('repairs an invalid view once, sending the validator errors back', async () => {
    const { svc, decide, records } = setup([
      decision({
        view: BAD,
        call: { text: '{"bad":1}', model: 'm', latencyMs: 1 },
      }),
      decision({ view: view() }),
    ]);
    const r = await svc.ask({ q: 'offices as a line', lang: 'en' });
    expect(r.answeredBy).toBe('model');
    expect(decide).toHaveBeenCalledTimes(2);
    const repair = decide.mock.calls[1][0].repair;
    expect(repair?.previous).toBe('{"bad":1}');
    expect(repair?.errors.map((e) => e.code)).toContain('line-needs-years');
    expect(records[0].decisions?.map((d) => d.validated)).toEqual([
      null,
      view(),
    ]);
  });

  it('never returns an unvalidated view: two failures fall back to the nearest valid card', async () => {
    const { svc, decide } = setup([
      decision({ view: BAD }),
      decision({ view: BAD }),
    ]);
    const r = await svc.ask({ q: 'money by sector please', lang: 'en' });
    expect(decide).toHaveBeenCalledTimes(2);
    expect(r.answeredBy).toBe('refused');
    expect(r.refusal).toBe('not-understood');
    expect(r.view).toEqual(view({ groupBy: 'sector' })); // the 2019 card is not public, so never offered
    expect(r.suggestions?.map((c) => c.id)).toEqual(['by-sector']);
  });

  it('does not retry when the endpoint itself failed', async () => {
    const { svc, decide } = setup([
      decision({ call: undefined, error: 'timeout' }),
    ]);
    const r = await svc.ask({ q: 'something new', lang: 'en' });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(r.answeredBy).toBe('refused');
  });

  it('passes a model refusal through with suggestions', async () => {
    const { svc } = setup([decision({ refusal: 'Not about the budget.' })]);
    const r = await svc.ask({ q: 'who won the election', lang: 'en' });
    expect(r).toMatchObject({
      answeredBy: 'refused',
      refusal: 'Not about the budget.',
    });
    expect(r.view).toBeUndefined();
  });
});

describe('AskService resting mode and limits', () => {
  it('rests with budget-exhausted cards when AI is switched off', async () => {
    process.env.EXPLORER_AI_ENABLED = '0';
    const { svc, decide } = setup([]);
    const r = await svc.ask({ q: 'something new', lang: 'en' });
    expect(r).toMatchObject({ answeredBy: 'resting', mode: 'resting' });
    expect(r.suggestions?.map((c) => c.id)).toEqual(['by-sector']);
    expect(decide).not.toHaveBeenCalled();
  });

  it('rests once the day’s budget is spent, and says so in capabilities', async () => {
    process.env.EXPLORER_DAILY_BUDGET_USD = '0.009';
    // 1000 tokens in at $3/M + 100 out at $15/M = $0.0045 per call; two calls reach it
    const { svc, decide } = setup([
      decision({ view: view() }),
      decision({ view: view({ groupBy: 'fund' }) }),
    ]);
    expect(await svc.mode()).toBe('normal');
    await svc.ask({ q: 'first question', lang: 'en' });
    await svc.ask({ q: 'second question', lang: 'en' });
    expect(await svc.mode()).toBe('resting');
    const r = await svc.ask({ q: 'third question', lang: 'en' });
    expect(r.answeredBy).toBe('resting');
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('a card or cache hit still answers while resting', async () => {
    process.env.EXPLORER_DAILY_BUDGET_USD = '0';
    const { svc } = setup([]);
    const r = await svc.ask({ q: 'Where does the 2027 money go, by sector?' });
    expect(r.answeredBy).toBe('card');
  });

  it('limits one device to 30 model calls an hour; cards do not count', async () => {
    const answers = Array.from({ length: 31 }, (_, i) =>
      decision({ view: view({ top: i + 1 }) }),
    );
    const { svc } = setup(answers);
    for (let i = 0; i < 5; i++)
      await svc.ask({
        q: 'Where does the 2027 money go, by sector?',
        deviceKey: 'dev-1',
      });
    for (let i = 0; i < 30; i++)
      await svc.ask({ q: `question ${i}`, deviceKey: 'dev-1' });
    await expect(
      svc.ask({ q: 'question 30', deviceKey: 'dev-1' }),
    ).rejects.toBeInstanceOf(DeviceLimitError);
    // another device is unaffected
    await expect(
      svc.ask({ q: 'question 30', deviceKey: 'dev-2' }),
    ).resolves.toMatchObject({ answeredBy: 'model' });
  });

  it('hashes the device key with the salt and never keeps it raw', () => {
    const { limits } = setup([]);
    const h = limits.hashDevice('device-abc');
    expect(h).toHaveLength(32);
    expect(h).not.toContain('device-abc');
    expect(limits.hashDevice(undefined)).toBeUndefined();
  });
});
