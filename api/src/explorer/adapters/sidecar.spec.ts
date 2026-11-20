import { backendFor } from '../ports/inference.port.js';
import { inferenceFromEnv, SidecarDecider } from './sidecar.js';

const ok = (body: unknown) =>
  ({ ok: true, json: () => Promise.resolve(body) }) as Response;

describe('inference port (specs/020 B3.1)', () => {
  it('defaults every capability to openai, and decide to nothing', () => {
    const saved = process.env.EMBED_MODEL;
    process.env.EMBED_MODEL = 'text-embedding-3-small';
    const i = inferenceFromEnv(process.env);
    if (saved === undefined) delete process.env.EMBED_MODEL;
    else process.env.EMBED_MODEL = saved;
    expect(i.embedder?.model).toBe('text-embedding-3-small');
    expect(i.decider).toBeNull();
    expect(backendFor('complete', {})).toBe('openai');
  });

  it('a global sidecar serves embed and decide; chat stays on openai', () => {
    const env = { EXPLORER_INFERENCE: 'sidecar' };
    expect(backendFor('complete', env)).toBe('openai');
    expect(backendFor('embed', env)).toBe('sidecar');
    expect(backendFor('decide', env)).toBe('sidecar');
  });

  it('refuses what a backend cannot do or may not be used for', () => {
    expect(() =>
      backendFor('complete', { EXPLORER_INFERENCE_COMPLETE: 'sidecar' }),
    ).toThrow(/no chat model/);
    expect(() =>
      backendFor('decide', { EXPLORER_INFERENCE_DECIDE: 'openai' }),
    ).toThrow(/sidecar or the Stride API/);
    expect(() => backendFor('embed', { EXPLORER_INFERENCE: 'stride' })).toThrow(
      /opt-in per LGU/,
    );
    expect(() => backendFor('embed', { EXPLORER_INFERENCE: 'gpu' })).toThrow(
      /openai \| sidecar \| stride/,
    );
  });

  it('the Stride API needs the opt-in, a URL and a key, and sends the key as a bearer', async () => {
    const env = {
      EXPLORER_INFERENCE_EMBED: 'stride',
      EXPLORER_STRIDE_OPT_IN: '1',
      STRIDE_API_URL: 'https://inference.example/',
      STRIDE_API_KEY: 'k',
      EMBED_MODEL: 'intfloat/multilingual-e5-base',
    };
    const fetchFn = jest
      .fn()
      .mockResolvedValue(ok({ data: [{ index: 0, embedding: [3, 4] }] }));
    const { embedder } = inferenceFromEnv(env, fetchFn);
    expect(await embedder!.embed(['roads'], 'query')).toEqual([[0.6, 0.8]]);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://inference.example/v1/embeddings');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer k',
    );
    expect(JSON.parse(init.body as string).input_type).toBe('query');
    expect(() =>
      inferenceFromEnv({ ...env, STRIDE_API_KEY: '' }, fetchFn),
    ).toThrow(/STRIDE_API_KEY/);
  });

  it('SidecarDecider posts state and questions and refuses a skipped question', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      ok({
        model: 'laya:multilingual',
        answers: { label: { type: 'choice', choice: 'health' } },
      }),
    );
    const d = new SidecarDecider(
      { baseUrl: 'http://inference:8100', headers: {} },
      fetchFn,
    );
    const q = {
      label: {
        type: 'choice' as const,
        instructions: 'What is the row for?',
        criteria: { health: 'clinics', roads: 'roads' },
      },
    };
    const out = await d.decide({ row: 'clinic supplies' }, q);
    expect(out.answers.label.choice).toBe('health');
    expect(fetchFn.mock.calls[0][0]).toBe('http://inference:8100/v1/decide');
    await expect(
      d.decide('x', {
        ...q,
        named: { type: 'noul', instructions: 'Names a barangay?' },
      }),
    ).rejects.toThrow(/skipped named/);
  });
});
