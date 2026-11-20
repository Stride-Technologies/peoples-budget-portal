/**
 * DI tokens for the two Redis connections. A connection in subscribe mode
 * cannot issue normal commands, so the command client and the subscriber are
 * distinct providers. Both resolve to `Redis | null` — `null` when `REDIS_URL`
 * is unset, which is the in-memory / in-process fallback signal.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');

/** Channel every replica publishes program-activity nudges to. */
export const PROGRAM_EVENTS_CHANNEL = 'program-events';
