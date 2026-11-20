import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Observable, Subject, interval, merge, map } from 'rxjs';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PROGRAM_EVENTS_CHANNEL,
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
} from '../redis/redis.constants.js';
import { Role } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';

/** SSE event kinds pushed to the client as thin nudges. */
export type ProgramEventType =
  | 'comment.posted'
  | 'comment.resolved'
  | 'program.status';

export interface ProgramEvent {
  type: ProgramEventType;
  programId: string;
  actorUserId: string;
}

/** Loosely-typed SSE message envelope accepted by Nest's `@Sse()`. */
export interface SseMessage {
  data: Record<string, unknown>;
}

/** Program fields needed to decide who an event is relevant to. */
interface ProgramRelevance {
  officeId: string | null;
  clusterId: string | null;
}

/**
 * What travels over the Redis channel: the client-facing event plus the
 * program's relevance fields, so a receiving replica fans out without its own
 * DB lookup. In the no-Redis fallback the same shape is passed straight to
 * `fanOut`.
 */
interface ProgramEventEnvelope extends ProgramEvent {
  ts: string;
  program: ProgramRelevance;
}

/**
 * Resolved relevance context for a connected user. Cached at connect time so
 * per-event fan-out needs no extra DB calls for the recipient side.
 */
interface UserContext {
  userId: string;
  role: Role;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  clusterId: string | null;
  canEndorse: boolean;
  /** When the access token that opened the stream expires (epoch ms). */
  expiresAt: number;
}

interface Connection {
  ctx: UserContext;
  subject: Subject<SseMessage>;
}

const TICKET_TTL_MS = 60_000;
/** For a token with no `exp` claim: the access token's usual lifetime. */
const DEFAULT_STREAM_MS = 15 * 60_000;
const HEARTBEAT_MS = 25_000;

/**
 * SSE hub. Issues short-lived single-use stream tickets, holds the open
 * per-replica connections, and fans thin program-event nudges to every
 * connected user who can see the program (relevance = visibility).
 *
 * Cross-replica delivery: when Redis is configured, `emitProgramEvent`
 * publishes to the `program-events` channel and every replica (this one
 * included, via its own subscription) fans the event out to its local
 * connections. Without Redis it dispatches in-process — correct for a single
 * replica, which is the dev / CI default.
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private readonly tickets = new Map<
    string,
    { ctx: UserContext; expiresAt: number }
  >();
  private readonly connections = new Map<string, Connection>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis | null,
  ) {}

  /** Subscribe to the cross-replica event channel when Redis is configured. */
  onModuleInit(): void {
    if (!this.subscriber) {
      this.logger.log('Redis unset — SSE runs in-process (single replica)');
      return;
    }
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== PROGRAM_EVENTS_CHANNEL) return;
      try {
        this.fanOut(JSON.parse(message) as ProgramEventEnvelope);
      } catch (err) {
        this.logger.warn(
          `Discarded malformed program-event: ${(err as Error).message}`,
        );
      }
    });
    void this.subscriber
      .subscribe(PROGRAM_EVENTS_CHANNEL)
      .then(() => {
        this.logger.log(
          `Subscribed to ${PROGRAM_EVENTS_CHANNEL} for SSE fan-out`,
        );
      })
      .catch((err: Error) => {
        this.logger.error(
          `Failed to subscribe to ${PROGRAM_EVENTS_CHANNEL}: ${err.message}`,
        );
      });
  }

  /** Issue a ~60s single-use ticket for the authenticated user. */
  async issueTicket(user: JwtPayload): Promise<{ ticket: string }> {
    this.sweepExpiredTickets();
    const ctx = await this.resolveContext(user);
    const ticket = randomBytes(32).toString('hex');
    this.tickets.set(ticket, { ctx, expiresAt: Date.now() + TICKET_TTL_MS });
    return { ticket };
  }

  /**
   * Consume a single-use ticket and open an SSE stream. The ticket is deleted
   * on use regardless of validity. Throws if missing/expired.
   */
  connect(ticket: string | undefined): Observable<SseMessage> {
    const entry = ticket ? this.tickets.get(ticket) : undefined;
    if (ticket) this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired stream ticket');
    }

    const connectionId = randomBytes(16).toString('hex');
    const subject = new Subject<SseMessage>();
    this.connections.set(connectionId, { ctx: entry.ctx, subject });

    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): SseMessage => ({ data: { type: 'ping' } })),
    );

    return new Observable<SseMessage>((subscriber) => {
      subscriber.next({ data: { type: 'connected' } });
      const sub = merge(subject, heartbeat).subscribe(subscriber);
      // merge() never completes while the heartbeat runs, so closeForUser's
      // completion of the subject has to end the stream itself.
      sub.add(subject.subscribe({ complete: () => subscriber.complete() }));
      // A stream lives no longer than the access token that opened it. The
      // browser's EventSource reconnects through the client proxy with a fresh
      // ticket, which runs JwtGuard and resolveContext again, so a deactivated
      // or narrowed user stops receiving within one token lifetime.
      const expiry = setTimeout(
        () => subscriber.complete(),
        Math.max(0, entry.ctx.expiresAt - Date.now()),
      );
      expiry.unref?.();
      return () => {
        clearTimeout(expiry);
        sub.unsubscribe();
        this.connections.delete(connectionId);
      };
    });
  }

  /**
   * End every stream this replica holds for `userId` now, rather than at token
   * expiry. Called when a user's access changes (deactivation, office, role,
   * grants); the client reconnects and is re-authorized from scratch.
   */
  closeForUser(userId: string): void {
    for (const conn of this.connections.values()) {
      if (conn.ctx.userId === userId) conn.subject.complete();
    }
  }

  /**
   * Emit a program event. Fire-and-forget: failures are logged, never thrown
   * into the caller. With Redis, the event is published to every replica;
   * without it, dispatched to this replica's connections only.
   */
  emitProgramEvent(event: ProgramEvent): void {
    void this.publish(event).catch((err) => {
      this.logger.error(`Failed to emit ${event.type}`, err as Error);
    });
  }

  private async publish(event: ProgramEvent): Promise<void> {
    // No Redis and nobody connected here — nothing to do.
    if (!this.redis && this.connections.size === 0) return;

    const program = await this.resolveProgram(event.programId);
    if (!program) return;

    const envelope: ProgramEventEnvelope = {
      ...event,
      ts: new Date().toISOString(),
      program,
    };

    if (this.redis) {
      // Every replica — this one included — receives it via its subscription.
      await this.redis.publish(
        PROGRAM_EVENTS_CHANNEL,
        JSON.stringify(envelope),
      );
    } else {
      this.fanOut(envelope);
    }
  }

  /** Resolve the relevance fields for a program, or `null` if it is gone. */
  private async resolveProgram(
    programId: string,
  ): Promise<ProgramRelevance | null> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: {
        officeId: true,
        office: { select: { clusterId: true } },
      },
    });
    if (!program) return null;
    return {
      officeId: program.officeId,
      clusterId: program.office?.clusterId ?? null,
    };
  }

  /** Push an event to every local connection that can see the program. */
  private fanOut(envelope: ProgramEventEnvelope): void {
    if (this.connections.size === 0) return;

    const { program, ...event } = envelope;
    const message: SseMessage = { data: { ...event } };

    for (const conn of this.connections.values()) {
      if (this.isRelevant(conn.ctx, program)) {
        conn.subject.next(message);
      }
    }
  }

  /** Relevance = visibility: mirrors `ProgramsService.assertCanRead`. */
  private isRelevant(ctx: UserContext, program: ProgramRelevance): boolean {
    if (ctx.role === Role.SUPER_ADMIN) return true;
    if (ctx.role === Role.HEAD && ctx.canEndorse) return true;
    if (program.officeId && program.officeId === ctx.officeId) {
      return true;
    }
    return (
      !!program.clusterId &&
      !!ctx.clusterId &&
      program.clusterId === ctx.clusterId
    );
  }

  private async resolveContext(user: JwtPayload): Promise<UserContext> {
    let clusterId: string | null = null;
    let canEndorse = false;

    if (user.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: user.officeId },
        select: { clusterId: true, canEndorse: true },
      });
      clusterId = office?.clusterId ?? null;
      canEndorse = office?.canEndorse ?? false;
    } else if (user.civilSocietyOrganizationId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: user.civilSocietyOrganizationId },
        select: { clusterId: true },
      });
      clusterId = cso?.clusterId ?? null;
    }

    return {
      userId: user.sub,
      role: user.role,
      officeId: user.officeId,
      civilSocietyOrganizationId: user.civilSocietyOrganizationId,
      clusterId,
      canEndorse,
      expiresAt: user.exp ? user.exp * 1000 : Date.now() + DEFAULT_STREAM_MS,
    };
  }

  private sweepExpiredTickets(): void {
    const now = Date.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }
}
