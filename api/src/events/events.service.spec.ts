import { UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type { Redis } from 'ioredis';
import { EventsService, type SseMessage } from './events.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { PROGRAM_EVENTS_CHANNEL } from '../redis/redis.constants.js';
import { Role } from '../generated/prisma/index';

const admin: JwtPayload = {
  sub: 'admin-1',
  role: Role.SUPER_ADMIN,
  email: 'admin@x.com',
  firstName: 'Ada',
  lastName: 'Admin',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
};

function makePrisma(): PrismaService {
  return {
    office: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ clusterId: 'cl-1', canEndorse: false }),
    },
    civilSocietyOrganization: {
      findUnique: jest.fn().mockResolvedValue({ clusterId: 'cl-1' }),
    },
    program: {
      findUnique: jest.fn().mockResolvedValue({
        officeId: null,
        civilSocietyOrganizationId: null,
        office: null,
        civilSocietyOrganization: null,
      }),
    },
  } as unknown as PrismaService;
}

/** Let the fire-and-forget emit path settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('EventsService', () => {
  describe('in-process mode (no Redis)', () => {
    let service: EventsService;

    beforeEach(() => {
      service = new EventsService(makePrisma(), null, null);
    });

    describe('stream tickets', () => {
      it('issues a single-use ticket that opens a stream once', async () => {
        const { ticket } = await service.issueTicket(admin);
        expect(typeof ticket).toBe('string');
        expect(ticket.length).toBeGreaterThan(16);

        expect(() => service.connect(ticket)).not.toThrow();
        // Reuse of the same ticket is rejected (single-use).
        expect(() => service.connect(ticket)).toThrow(UnauthorizedException);
      });

      it('rejects an unknown ticket', () => {
        expect(() => service.connect('not-a-real-ticket')).toThrow(
          UnauthorizedException,
        );
      });

      it('rejects a missing ticket', () => {
        expect(() => service.connect(undefined)).toThrow(UnauthorizedException);
      });
    });

    it('emits a "connected" control frame on subscribe', async () => {
      const { ticket } = await service.issueTicket(admin);
      const first = await firstValueFrom(service.connect(ticket));
      expect(first.data).toEqual({ type: 'connected' });
    });

    it('dispatches an emitted event to a connected stream', async () => {
      const { ticket } = await service.issueTicket(admin);
      const received: SseMessage[] = [];
      const sub = service.connect(ticket).subscribe((m) => received.push(m));

      service.emitProgramEvent({
        type: 'comment.posted',
        programId: 'p1',
        actorUserId: 'u9',
      });
      await flush();

      expect(received[0].data).toEqual({ type: 'connected' });
      expect(received[1]?.data).toMatchObject({
        type: 'comment.posted',
        programId: 'p1',
        actorUserId: 'u9',
      });
      sub.unsubscribe();
    });

    it('ends the stream when the token that opened it expires', async () => {
      const { ticket } = await service.issueTicket({
        ...admin,
        exp: Math.floor(Date.now() / 1000) - 1,
      });
      let completed = false;
      service.connect(ticket).subscribe({ complete: () => (completed = true) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(completed).toBe(true);
    });

    it("ends a user's streams when their access changes", async () => {
      const { ticket } = await service.issueTicket(admin);
      let completed = false;
      const sub = service
        .connect(ticket)
        .subscribe({ complete: () => (completed = true) });
      service.closeForUser('someone-else');
      expect(completed).toBe(false);
      service.closeForUser(admin.sub);
      expect(completed).toBe(true);
      sub.unsubscribe();
    });
  });

  describe('Redis mode', () => {
    it('publishes the event to the program-events channel', async () => {
      const publish = jest.fn().mockResolvedValue(1);
      const redis = { publish } as unknown as Redis;
      const service = new EventsService(makePrisma(), redis, null);

      service.emitProgramEvent({
        type: 'program.status',
        programId: 'p1',
        actorUserId: 'u9',
      });
      await flush();

      expect(publish).toHaveBeenCalledTimes(1);
      const [channel, body] = publish.mock.calls[0] as [string, string];
      expect(channel).toBe(PROGRAM_EVENTS_CHANNEL);
      expect(JSON.parse(body)).toMatchObject({
        type: 'program.status',
        programId: 'p1',
        program: { clusterId: null },
      });
    });

    it('subscribes on init and fans a channel message to a stream', async () => {
      let messageHandler:
        | ((channel: string, message: string) => void)
        | undefined;
      const subscribe = jest.fn().mockResolvedValue(undefined);
      const subscriber = {
        subscribe,
        on: jest.fn((event: string, cb: typeof messageHandler) => {
          if (event === 'message') messageHandler = cb;
        }),
      } as unknown as Redis;
      const service = new EventsService(makePrisma(), null, subscriber);

      service.onModuleInit();
      expect(subscribe).toHaveBeenCalledWith(PROGRAM_EVENTS_CHANNEL);
      expect(messageHandler).toBeDefined();

      const { ticket } = await service.issueTicket(admin);
      const received: SseMessage[] = [];
      const sub = service.connect(ticket).subscribe((m) => received.push(m));

      messageHandler!(
        PROGRAM_EVENTS_CHANNEL,
        JSON.stringify({
          type: 'comment.resolved',
          programId: 'p2',
          actorUserId: 'u3',
          ts: new Date().toISOString(),
          program: {
            officeId: null,
            civilSocietyOrganizationId: null,
            clusterId: null,
          },
        }),
      );

      expect(received[1]?.data).toMatchObject({
        type: 'comment.resolved',
        programId: 'p2',
      });
      sub.unsubscribe();
    });

    it('does not block module init while Redis subscribe is pending', () => {
      const subscribe = jest.fn(
        () => new Promise<never>(() => undefined),
      ) as jest.MockedFunction<Redis['subscribe']>;
      const subscriber = {
        subscribe,
        on: jest.fn(),
      } as unknown as Redis;
      const service = new EventsService(makePrisma(), null, subscriber);

      expect(() => service.onModuleInit()).not.toThrow();
      expect(subscribe).toHaveBeenCalledWith(PROGRAM_EVENTS_CHANNEL);
    });
  });
});
