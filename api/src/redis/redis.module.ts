import {
  Global,
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants.js';

const logger = new Logger('RedisModule');

/**
 * Build one Redis connection, or `null` when `REDIS_URL` is unset. A `null`
 * connection is the signal for the cache and SSE layers to fall back to their
 * in-process behavior — the API runs fully without Redis (dev / CI).
 *
 * `maxRetriesPerRequest: 2` makes commands fail fast when Redis is down rather
 * than hanging a request; an attached `error` handler keeps a connection drop
 * from crashing the process.
 */
function createRedis(config: ConfigService, label: string): Redis | null {
  const url = config.get<string>('REDIS_URL');
  if (!url) {
    logger.log(
      `REDIS_URL unset — Redis ${label} disabled (in-process fallback)`,
    );
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('connect', () => logger.log(`Redis ${label} connected`));
  client.on('error', (err) =>
    logger.error(`Redis ${label} error: ${err.message}`),
  );
  return client;
}

/**
 * Global Redis foundation: exposes a command client (`REDIS_CLIENT`) and a
 * dedicated subscriber connection (`REDIS_SUBSCRIBER`). Both are `Redis | null`.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => createRedis(config, 'client'),
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (config: ConfigService) => createRedis(config, 'subscriber'),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis | null,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client?.quit(), this.subscriber?.quit()]);
  }
}
