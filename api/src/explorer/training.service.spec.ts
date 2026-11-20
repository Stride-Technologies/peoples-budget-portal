import type { PrismaService } from '../prisma/prisma.service.js';
import type { TypedDecisionPort } from './ports/inference.port.js';
import {
  ExplorerTrainingService,
  PERSON_DROP_AT,
  regexFlags,
} from './training.service.js';

const prismaMock = () => ({
  explorerTrainingQuestion: {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
  },
});
const decider = (p: number | null): TypedDecisionPort => ({
  model: 'laya-test',
  decide: jest.fn().mockResolvedValue({
    model: 'laya-test',
    latencyMs: 1,
    answers: { person: { type: 'noul', p } },
  }),
});
const ON = {
  EXPLORER_ENABLED: '1',
  EXPLORER_AI_ENABLED: '1',
  EXPLORER_TRAINING_CAPTURE: '1',
  EXPLORER_PRIVACY_NOTICE_VERSION: '2027-01',
};
const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});
const q = (text: string, consent: boolean | null = true) => ({
  consent: consent ?? undefined,
  text,
  lang: 'en',
  kind: 'ask' as const,
  spec: { v: 1 },
});

describe('scrubber regexes (specs/020 B4.2)', () => {
  it('flags contacts, ids, handles and a titled name; passes budget questions', () => {
    expect(regexFlags('email me at juan.cruz@gmail.com')).toEqual(['email']);
    expect(regexFlags('call 0917 123 4567 about the road')).toContain('phone');
    expect(regexFlags('my TIN is 123-456-789-000')).toEqual(['digits']);
    expect(regexFlags('ask @juandc')).toEqual(['handle']);
    expect(regexFlags('How much did Kap. Santos get?')).toEqual([
      'titled-name',
    ]);
    expect(regexFlags('Magkano ang para kay Aling Rosa?')).toContain(
      'titled-name',
    );
    expect(regexFlags('KONSEHAL CRUZ budget')).toEqual(['titled-name']);
    expect(regexFlags('para kay Ñora at sa iba')).toEqual(['person-marker']);
    expect(regexFlags('magkano natanggap ni Pedro?')).toEqual([
      'person-marker',
    ]);
    expect(regexFlags('landline 473-1234')).toEqual(['landline']);
    expect(regexFlags('+63 917 123 4567')).toContain('phone');
    expect(regexFlags('see facebook.com/juan.dc')).toEqual(['handle']);
    expect(regexFlags('kanal sa Purok 3, Zone 2')).toEqual(['address']);
    for (const ok of [
      'How much goes to health in 2027?',
      'Magkano ang budget ng CHO sa 2026?',
      'Roads in Concepcion Pequeña, ₱12,000,000?',
      'What does the City Mayor’s Office spend on?',
      'How did the AIP change from 2026 to 2027?',
      'Saan napupunta ang pondo sa Concepcion Grande?',
    ])
      expect(regexFlags(ok)).toEqual([]);
  });
});

describe('ExplorerTrainingService.capture (specs/020 B4)', () => {
  it('stores nothing unless the LGU opted in and named its privacy notice', async () => {
    Object.assign(process.env, ON, { EXPLORER_PRIVACY_NOTICE_VERSION: '' });
    const p0 = prismaMock();
    const s0 = new ExplorerTrainingService(
      p0 as unknown as PrismaService,
      decider(0.01),
    );
    expect(await s0.capture(q('How much for health?'))).toBe('off');
    process.env = { ...ENV };
    const prisma = prismaMock();
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      decider(0.01),
    );
    expect(await svc.capture(q('How much for health?'))).toBe('off');
    expect(prisma.explorerTrainingQuestion.create).not.toHaveBeenCalled();
  });

  it('stores nothing unless the resident ticked the box', async () => {
    Object.assign(process.env, ON);
    const prisma = prismaMock();
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      decider(0.01),
    );
    expect(await svc.capture(q('How much for health?', null))).toBe(
      'no-consent',
    );
    expect(await svc.capture(q('How much for health?', false))).toBe(
      'no-consent',
    );
    expect(prisma.explorerTrainingQuestion.create).not.toHaveBeenCalled();
  });

  it('drops, never redacts, a question the scrubber flags', async () => {
    Object.assign(process.env, ON);
    const prisma = prismaMock();
    const d = decider(PERSON_DROP_AT);
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      d,
    );
    expect(await svc.capture(q('text 09171234567 the budget'))).toBe('dropped');
    expect(d.decide).not.toHaveBeenCalled(); // the regex is enough
    expect(await svc.capture(q('How much did my neighbour Juan get?'))).toBe(
      'dropped',
    );
    expect(prisma.explorerTrainingQuestion.create).not.toHaveBeenCalled();
  });

  it('fails closed with no decision model, an empty answer or an error', async () => {
    Object.assign(process.env, ON);
    const prisma = prismaMock();
    const none = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      null,
    );
    expect(await none.capture(q('How much for health?'))).toBe('dropped');
    const empty = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      decider(null),
    );
    expect(await empty.capture(q('How much for health?'))).toBe('dropped');
    const broken: TypedDecisionPort = {
      model: 'x',
      decide: jest.fn().mockRejectedValue(new Error('down')),
    };
    const err = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      broken,
    );
    expect(await err.capture(q('How much for health?'))).toBe('dropped');
    expect(prisma.explorerTrainingQuestion.create).not.toHaveBeenCalled();
  });

  it('stores a clean, consented question with its spec and verdict, no device or person', async () => {
    Object.assign(process.env, ON);
    const prisma = prismaMock();
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      decider(0.03),
    );
    expect(await svc.capture(q('How much for health in 2027?'))).toBe('stored');
    const data = prisma.explorerTrainingQuestion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      text: 'How much for health in 2027?',
      kind: 'ask',
      spec: { v: 1 },
      verdict: {
        regex: [],
        personP: 0.03,
        model: 'laya-test',
        notice: '2027-01',
      },
    });
    expect(Object.keys(data).sort()).toEqual(
      ['consentAt', 'kind', 'lang', 'spec', 'text', 'verdict'].sort(),
    );
  });

  it('never sends the question to the Stride API without its own switch', async () => {
    Object.assign(process.env, ON, {
      EXPLORER_INFERENCE_DECIDE: 'stride',
      EXPLORER_STRIDE_OPT_IN: '1',
    });
    const prisma = prismaMock();
    const d = decider(0.01);
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      d,
    );
    expect(await svc.capture(q('How much for health?'))).toBe('dropped');
    expect(d.decide).not.toHaveBeenCalled();
    process.env.EXPLORER_TRAINING_SCRUB_REMOTE = '1';
    expect(await svc.capture(q('How much for health?'))).toBe('stored');
  });

  it('drops rather than queues when the scrubber is busy', async () => {
    Object.assign(process.env, ON);
    const prisma = prismaMock();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: TypedDecisionPort = {
      model: 'slow',
      decide: jest.fn().mockImplementation(async () => {
        await gate;
        return {
          model: 'slow',
          latencyMs: 1,
          answers: { person: { type: 'noul', p: 0 } },
        };
      }),
    };
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      slow,
    );
    const pending = Array.from({ length: 4 }, () =>
      svc.capture(q('How much?')),
    );
    expect(await svc.capture(q('How much?'))).toBe('dropped');
    release();
    expect(await Promise.all(pending)).toEqual(Array(4).fill('stored'));
  });

  it('retention deletes rows older than 12 months', async () => {
    const prisma = prismaMock();
    const svc = new ExplorerTrainingService(
      prisma as unknown as PrismaService,
      null,
    );
    expect(await svc.retention(new Date('2027-11-13T00:00:00Z'))).toBe(3);
    expect(
      prisma.explorerTrainingQuestion.deleteMany.mock.calls[0][0].where
        .createdAt.lt,
    ).toEqual(new Date('2026-11-13T00:00:00Z'));
  });
});
