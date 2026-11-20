import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Production splits one origin across two containers by path: nginx sends the
 * API's prefix to NestJS and everything else to Next. The Next client also
 * serves its own same-origin route handlers under `src/app/api/`, so if the
 * nginx `location` claims more of `/api/` than the API actually owns it
 * silently swallows them — the browser gets NestJS's `Cannot GET …` 404 and
 * never reaches Next.
 *
 * That is invisible locally (no proxy) and on Azure dev/staging (client and API
 * are separate FQDNs), so it only ever shows up on budget.naga.gov.ph. It shipped
 * once and took the program edit page, the SSE stream and all four xlsx exports
 * down for the life of that host. This is the check that catches it next time.
 */

const repoRoot = new URL('../../../', import.meta.url);
const nginxConfs = ['nginx/nginx.conf'].map((p) => new URL(p, repoRoot));
const nextApiDir = new URL('client/src/app/api/', repoRoot);

/** `location <prefix> { … proxy_pass http://api:8000 … }` → the prefixes. */
function apiProxiedPrefixes(conf: string): string[] {
  return [...conf.matchAll(/location\s+(\S+)\s*\{([^}]*)\}/g)]
    .filter(([, , body]) => /proxy_pass\s+http:\/\/api:8000/.test(body))
    .map(([, prefix]) => prefix);
}

/** Every `src/app/api/**\/route.ts` as the URL path the browser requests. */
function nextApiRoutes(): string[] {
  return readdirSync(nextApiDir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('route.ts'))
    .map((entry) => `/api/${entry.replace(/\/?route\.ts$/, '')}`.replace(/\/$/, ''));
}

for (const nginxConf of nginxConfs) {
const name = nginxConf.pathname.split('/').slice(-2).join('/');

test(`${name}: the API location does not shadow the client’s own /api routes`, () => {
  const prefixes = apiProxiedPrefixes(readFileSync(nginxConf, 'utf8'));
  assert.ok(prefixes.length > 0, 'no location block proxies to api:8000 — did nginx.conf move?');

  const routes = nextApiRoutes();
  assert.ok(routes.length > 0, 'found no route handlers under src/app/api — did they move?');

  const shadowed = routes.flatMap((route) =>
    prefixes.filter((prefix) => route.startsWith(prefix)).map((prefix) => `${route} (nginx: ${prefix})`),
  );

  assert.deepEqual(
    shadowed,
    [],
    `nginx proxies these Next route handlers to the NestJS API, which has no such routes:\n  ${shadowed.join('\n  ')}`,
  );
});

test(`${name} and the server action let a 10 MB PPMP document through`, () => {
  const conf = readFileSync(nginxConf, 'utf8');
  const nginxLimit = /client_max_body_size\s+(\d+)m;/.exec(conf);
  assert.ok(nginxLimit && Number(nginxLimit[1]) > 10, 'nginx client_max_body_size must exceed 10m');
  const nextConfig = readFileSync(new URL('client/next.config.ts', repoRoot), 'utf8');
  const actionLimit = /bodySizeLimit:\s*["'](\d+)mb["']/.exec(nextConfig);
  assert.ok(actionLimit && Number(actionLimit[1]) > 10, 'serverActions.bodySizeLimit must exceed 10mb');
});
}
