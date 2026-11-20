import type { Card } from '../catalogue.service.js';
import { CAT } from '../test-catalogue.js';
import { LlmDecision, nearestExamples } from './decision.port.js';
import type { EmbedPort } from './embed.port.js';
import type { LlmPort } from './llm.port.js';

const V = {
  v: 1 as const,
  series: [],
  groupBy: 'office' as const,
  chart: 'bar' as const,
};
const card = (id: string, en: string, tags: string[] = []): Card => ({
  id,
  question: { en },
  view: V,
  tags,
});
const cards = [
  card('a', 'Where does the money go by office?', ['default']),
  card('b', 'How much goes to health?'),
  card('c', 'Which funds pay for roads?'),
];
// A toy embedder: one axis per topic word.
const embedder: EmbedPort = {
  model: 'toy',
  embed: (texts) =>
    Promise.resolve(
      texts.map((t) => {
        const v = [/office/i, /health/i, /fund|road/i].map((r) => +r.test(t));
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
      }),
    ),
};
const llm = (): LlmPort & { complete: jest.Mock } => ({
  model: 'm',
  complete: jest
    .fn()
    .mockResolvedValue({ text: '{"view":null}', model: 'm', latencyMs: 1 }),
});
const examplesIn = (system: string) =>
  [...system.matchAll(/^Q: (.*)$/gm)].map((m) => m[1]);

describe('few-shot retrieval (specs/020 B2.1)', () => {
  it('picks the nearest pairs, ties by id', () => {
    const pool = [
      { item: { id: 'z' }, vec: [1, 0] },
      { item: { id: 'y' }, vec: [1, 0] },
      { item: { id: 'x' }, vec: [0, 1] },
    ];
    expect(nearestExamples([1, 0], pool, 2).map((p) => p.id)).toEqual([
      'y',
      'z',
    ]);
  });

  it('prompt v3 carries the examples nearest the question; v2 the fixed defaults', async () => {
    const cat = { ...CAT, cards };
    const l3 = llm();
    await new LlmDecision(l3, () => '3', embedder).decide({
      question: 'health budget please',
      lang: 'en',
      catalogue: cat,
    });
    expect(examplesIn(l3.complete.mock.calls[0][0].system)[0]).toBe(
      'How much goes to health?',
    );
    const l2 = llm();
    await new LlmDecision(l2, () => '2', embedder).decide({
      question: 'health budget please',
      lang: 'en',
      catalogue: cat,
    });
    expect(examplesIn(l2.complete.mock.calls[0][0].system)).toEqual([
      'Where does the money go by office?',
    ]);
  });

  it('falls back to the fixed examples when the embedder fails', async () => {
    const l = llm();
    const broken: EmbedPort = {
      model: 'x',
      embed: () => Promise.reject(new Error('down')),
    };
    await new LlmDecision(l, () => '3', broken).decide({
      question: 'health',
      lang: 'en',
      catalogue: { ...CAT, cards },
    });
    expect(examplesIn(l.complete.mock.calls[0][0].system)).toEqual([
      'Where does the money go by office?',
    ]);
  });
});
