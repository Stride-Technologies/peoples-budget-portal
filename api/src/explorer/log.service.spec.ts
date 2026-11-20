import type { PrismaService } from '../prisma/prisma.service.js';
import {
  canonicalJson,
  ExplorerLogService,
  scrub,
  specHash,
} from './log.service.js';
import type { Decision } from './ports/decision.port.js';
import type { ExplorerView } from './view.js';

const V: ExplorerView = {
  v: 1,
  series: [{ document: 'aip', years: [2027], measure: 'money', filters: {} }],
  groupBy: 'office',
  chart: 'bar',
};
const D: Decision = {
  view: V,
  guessed: [],
  model: 'm',
  promptHash: 'ph',
  promptVersion: '1',
  input: { system: 'the catalogue…', user: 'how much for CHO?' },
  call: {
    text: '{"view":…}',
    model: 'm-2026',
    latencyMs: 42,
    tokensIn: 10,
    tokensOut: 5,
  },
};

function prismaMock() {
  return {
    explorerQuestion: {
      create: jest.fn().mockResolvedValue({ id: 'q1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'q1', calls: [{ id: 'c1' }] }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    explorerFeedback: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(3),
  };
}

const record = (svc: ExplorerLogService) =>
  svc.recordQuestion({
    text: 'how much for CHO?',
    lang: 'en',
    normalisedHash: 'nh',
    answeredBy: 'model',
    view: V,
    catalogueVersion: 'cv',
    promptVersion: '1',
    decisions: [{ decision: D, validated: V }],
  });

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe('ExplorerLogService', () => {
  it('stores the question text and the model call when logging is on', async () => {
    process.env.EXPLORER_LOG_QUESTIONS = '1';
    const prisma = prismaMock();
    await record(new ExplorerLogService(prisma as unknown as PrismaService));
    const data = prisma.explorerQuestion.create.mock.calls[0][0].data;
    expect(data.text).toBe('how much for CHO?');
    const call = data.calls.create[0];
    expect(call).toMatchObject({
      kind: 'ask',
      model: 'm-2026',
      promptHash: 'ph',
      ok: true,
      latencyMs: 42,
    });
    expect(call.input).toEqual({
      promptVersion: '1',
      user: 'how much for CHO?',
    });
  });

  it('stores no visitor text anywhere when EXPLORER_LOG_QUESTIONS is off', async () => {
    process.env.EXPLORER_LOG_QUESTIONS = '0';
    const prisma = prismaMock();
    const svc = new ExplorerLogService(prisma as unknown as PrismaService);
    await record(svc);
    const data = prisma.explorerQuestion.create.mock.calls[0][0].data;
    expect(data.text).toBeNull();
    expect(data.view).toEqual(V); // the view and the counts stay
    expect(JSON.stringify(data)).not.toContain('how much for CHO');
    await svc.feedback({
      recordId: 'q1',
      verdict: 'wrong',
      text: 'my name is Juan',
    });
    expect(
      prisma.explorerFeedback.create.mock.calls[0][0].data.text,
    ).toBeNull();
  });

  it('never stores an IP, user agent or user id', async () => {
    process.env.EXPLORER_LOG_QUESTIONS = '1';
    const prisma = prismaMock();
    await record(new ExplorerLogService(prisma as unknown as PrismaService));
    const keys = JSON.stringify(
      prisma.explorerQuestion.create.mock.calls[0][0],
    );
    expect(keys).not.toMatch(/"(ip|userAgent|userId|deviceKey)"/i);
  });

  it('takes one verdict per device per answer and links it to the last call', async () => {
    const prisma = prismaMock();
    const svc = new ExplorerLogService(prisma as unknown as PrismaService);
    await svc.feedback({
      recordId: 'q1',
      verdict: 'correct',
      deviceKeyHash: 'd1',
    });
    expect(prisma.explorerFeedback.create.mock.calls[0][0].data).toMatchObject({
      questionId: 'q1',
      callId: 'c1',
      deviceKeyHash: 'd1',
    });
    prisma.explorerFeedback.count.mockResolvedValueOnce(1);
    await svc.feedback({
      recordId: 'q1',
      verdict: 'wrong',
      deviceKeyHash: 'd1',
    });
    expect(prisma.explorerFeedback.create).toHaveBeenCalledTimes(1);
  });

  it('keeps one template record per view, language and catalogue, with no text', async () => {
    process.env.EXPLORER_LOG_QUESTIONS = '1';
    const prisma = prismaMock();
    const svc = new ExplorerLogService(prisma as unknown as PrismaService);
    expect(await svc.templateRecord(V, 's=aip:2027:money', 'fil', 'cv')).toBe(
      'q1',
    );
    const data = prisma.explorerQuestion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      answeredBy: 'template',
      lang: 'fil',
      text: null,
      view: V,
    });
    prisma.explorerQuestion.findFirst.mockResolvedValueOnce({ id: 'q9' });
    expect(await svc.templateRecord(V, 's=aip:2027:money', 'fil', 'cv')).toBe(
      'q9',
    );
    expect(prisma.explorerQuestion.create).toHaveBeenCalledTimes(1);
  });

  it('stores the answered spec on the question and copies it, hashed, onto the verdict (specs/020 B1.1)', async () => {
    const prisma = prismaMock();
    const svc = new ExplorerLogService(prisma as unknown as PrismaService);
    await record(svc);
    expect(prisma.explorerQuestion.create.mock.calls[0][0].data.spec).toEqual(
      V,
    );
    prisma.explorerQuestion.findUnique.mockResolvedValueOnce({
      id: 'q1',
      spec: V,
      calls: [],
    });
    await svc.feedback({ recordId: 'q1', verdict: 'wrong' });
    const data = prisma.explorerFeedback.create.mock.calls[0][0].data;
    expect(data.spec).toEqual(V);
    expect(data.specHash).toBe(specHash(V));
    expect(data.specHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes a spec the same whatever its key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
    expect(specHash({ x: 1, y: 2 })).toBe(specHash({ y: 2, x: 1 }));
  });

  it('404s feedback on an unknown answer', async () => {
    const prisma = prismaMock();
    prisma.explorerQuestion.findUnique.mockResolvedValueOnce(null);
    await expect(
      new ExplorerLogService(prisma as unknown as PrismaService).feedback({
        recordId: 'nope',
        verdict: 'correct',
      }),
    ).rejects.toThrow('No such answer');
  });

  it('retention nulls text older than 12 months on questions, feedback and call inputs', async () => {
    const prisma = prismaMock();
    const out = await new ExplorerLogService(
      prisma as unknown as PrismaService,
    ).retention(new Date('2027-11-08T00:00:00Z'));
    expect(out).toEqual({ questions: 2, feedback: 1, calls: 3 });
    const where = prisma.explorerQuestion.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      where: {
        createdAt: { lt: new Date('2026-11-08T00:00:00Z') },
        text: { not: null },
      },
      data: { text: null },
    });
  });
});

describe('scrub (W27)', () => {
  it('removes emails, PH phone numbers and long ID numbers; keeps years, amounts and names', () => {
    expect(
      scrub(
        'Ako si Juan, juan.dc@gmail.com, 0917 123 4567 / +639171234567, TIN 123-456-789-000: roads in Concepcion 2027 over 5 million?',
      ),
    ).toBe(
      'Ako si Juan, [removed], [removed] / [removed], TIN [removed]: roads in Concepcion 2027 over 5 million?',
    );
  });
});
