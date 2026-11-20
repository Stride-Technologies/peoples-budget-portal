import { detectLang, normalise, rankCards } from './match.js';
import { CAT } from './test-catalogue.js';
import { facts, f1, invented } from './eval/run.js';
import { answerSchema, toView } from './ports/decision.port.js';
import { OpenAiCompatibleLlm } from './adapters/openai-compatible.js';

describe('normalise', () => {
  it('folds width, case, punctuation and spaces', () => {
    expect(normalise('  Magkano  ang ＣＨＯ, sa 2027?! ')).toBe(
      'magkano ang cho sa 2027',
    );
  });
});

describe('detectLang (translate.py leak lists)', () => {
  it('keeps the page language without strong evidence', () => {
    expect(detectLang('How much for health?', 'en')).toBe('en');
    expect(detectLang('Magkano para sa CHO?', 'bcl')).toBe('bcl');
  });
  it('flips to Bikol on two Bikol function words', () => {
    expect(detectLang('Gurano an budget kan CHO asin CEO?', 'fil')).toBe('bcl');
  });
  it('flips to Filipino on two Tagalog function words', () => {
    expect(detectLang('Magkano ang budget ng CHO?', 'en')).toBe('fil');
  });
});

describe('rankCards', () => {
  const cat = {
    ...CAT,
    version: 'match-test',
    dimensions: {
      ...CAT.dimensions,
      office: [
        {
          id: 'CHO',
          label: 'CHO',
          sublabel: 'City Health Office',
          dbIds: ['x'],
          aliases: { fil: ['tanggapan ng kalusugan'] },
        },
      ],
    },
    cards: [
      {
        id: 'cho',
        tags: [],
        question: { en: 'City Health Office 2027 by sector' },
        view: {
          v: 1 as const,
          series: [
            {
              document: 'aip' as const,
              years: [2027],
              measure: 'money' as const,
              filters: { office: ['CHO'] },
            },
          ],
          groupBy: 'sector' as const,
          chart: 'bar' as const,
        },
      },
    ],
  };
  it('expands aliases so another language’s name for an office matches', () => {
    expect(
      rankCards('tanggapan ng kalusugan 2027 by sector', cat, 'en')[0].score,
    ).toBeGreaterThanOrEqual(0.85);
  });
  it('scores 0 when the years differ', () => {
    expect(
      rankCards('City Health Office 2026 by sector', cat, 'en')[0].score,
    ).toBe(0);
  });
});

describe('eval scoring', () => {
  const v = {
    v: 1 as const,
    series: [
      {
        document: 'aip' as const,
        years: [2027],
        measure: 'money' as const,
        filters: { office: ['CHO'] },
      },
    ],
    groupBy: 'sector' as const,
    chart: 'bar' as const,
  };
  it('F1 is 1 for the same view and partial for a near miss', () => {
    expect(f1(facts(v), facts(v))).toBe(1);
    const near = f1(facts(v), facts({ ...v, groupBy: 'office' }));
    expect(near).toBeGreaterThan(0.5);
    expect(near).toBeLessThan(1);
  });
  it('counts numbers the model wrote that it could not have read', () => {
    expect(invented('FY2027 AIP, ₱5,000,000 for CHO', v, 'CHO 2027')).toBe(1);
    expect(invented('FY2027 AIP by sector', v, 'CHO')).toBe(0);
  });
});

describe('decision port', () => {
  it('builds a strict schema whose ids are catalogue enums', () => {
    const s = JSON.stringify(answerSchema(CAT));
    expect(s).toContain('"enum":["CHO","CPDO"]');
    expect(s).toContain('"additionalProperties":false');
  });
  it('drops empty filters and nulls from the model output', () => {
    expect(
      toView({
        series: [
          {
            document: 'aip',
            years: [2027, 2027],
            measure: 'money',
            filters: { office: ['CHO'], fund: [] },
            label: null,
          },
        ],
        groupBy: 'sector',
        chart: 'bar',
        top: null,
      }),
    ).toEqual({
      v: 1,
      series: [
        {
          document: 'aip',
          years: [2027],
          measure: 'money',
          filters: { office: ['CHO'] },
        },
      ],
      groupBy: 'sector',
      chart: 'bar',
    });
  });
});

describe('OpenAiCompatibleLlm', () => {
  const ENV = { ...process.env };
  afterEach(() => (process.env = { ...ENV }));
  it('posts json_schema strict, temperature 0 and a seed; api-key header on Azure', async () => {
    process.env.LLM_BASE_URL = 'https://example.openai.azure.com/openai/v1/';
    process.env.LLM_MODEL = 'gpt-test';
    process.env.LLM_AUTH = 'key';
    process.env.LLM_API_KEY = 'k';
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"a":1}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        }),
    });
    const llm = new OpenAiCompatibleLlm(fetchFn);
    const out = await llm.complete({
      system: 's',
      user: 'u',
      schema: { name: 'x', schema: {} },
      seed: 0,
    });
    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      'https://example.openai.azure.com/openai/v1/chat/completions',
    );
    expect(init.headers['api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'gpt-test',
      temperature: 0,
      seed: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'x', strict: true },
      },
    });
    expect(out).toMatchObject({ text: '{"a":1}', tokensIn: 7, tokensOut: 3 });
  });
  it('uses a bearer token off Azure', async () => {
    process.env.LLM_BASE_URL = 'https://inference.do-ai.run/v1';
    process.env.LLM_MODEL = 'llama';
    process.env.LLM_API_KEY = 'k';
    delete process.env.LLM_AUTH;
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    });
    await new OpenAiCompatibleLlm(fetchFn).complete({
      system: 's',
      user: 'u',
      schema: { name: 'x', schema: {} },
    });
    expect(fetchFn.mock.calls[0][1].headers.authorization).toBe('Bearer k');
  });
});
