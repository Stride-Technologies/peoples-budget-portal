/**
 * Where the hearings pages read from (docs/hearings-api.md). Read when the client is built
 * (`NEXT_PUBLIC_*`): the page's content-security policy has to name the same address, and
 * that policy is fixed at build time (next.config.ts). Unset, the portal has no hearings pages.
 */
export const HEARINGS_API_URL = (process.env.NEXT_PUBLIC_HEARINGS_API_URL ?? '').trim().replace(/\/+$/, '');
export const HEARINGS_ENABLED = /^https?:\/\//.test(HEARINGS_API_URL);
