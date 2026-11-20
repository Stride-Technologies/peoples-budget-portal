/**
 * Shared plumbing for the full authoring-workflow spec.
 *
 * This suite runs against whatever `DATABASE_URL` the API is pointed at — which
 * in this repo is normally the live Supabase project. Everything it creates is
 * therefore named with `TEST_PREFIX` and torn down through the API afterwards.
 * Nothing here truncates or touches the DB directly; deletion goes through
 * `DELETE /programs/:id`, which SUPER_ADMIN is allowed to call even on a
 * published program (`api/src/programs/programs.service.ts` `softDelete`).
 */
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { loginAsSuperAdmin, loginTokens, type AuthenticatedApi } from '../aip-cycle/api-helpers';
import { loadApiEnv } from '../aip-cycle/db-helpers';

// `api-helpers.apiBaseUrl()` defaults to the aip-cycle harness port (8010). This
// suite runs against the ordinary dev API, so pin 8000 before anything reads it.
process.env.API_URL ??= 'http://localhost:8000/api/v1';

export const API_BASE = process.env.API_URL;
export const CLIENT_BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/** Unmistakable in a registry full of real budget records. */
export const TEST_PREFIX = 'E2E WORKFLOW';
export const RUN_ID = Date.now().toString(36);

export function testProgramName(label: string): string {
  return `${TEST_PREFIX} ${RUN_ID} ${label} — DO NOT USE`;
}

export async function superAdmin(request: APIRequestContext): Promise<AuthenticatedApi> {
  return loginAsSuperAdmin(request);
}

/**
 * Authenticate the browser by injecting the session cookies rather than driving
 * the login form: the form is not what this suite is testing, and the tokens are
 * the same ones the app would have set. Mirrors the helper in
 * `aip-cycle/aip-cycle.preflight.spec.ts`.
 */
export async function loginBrowserAsSuperAdmin(
  context: BrowserContext,
  request: APIRequestContext,
): Promise<void> {
  loadApiEnv();
  const email = process.env.AIP_E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.AIP_E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing admin credentials. Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD in api/.env.',
    );
  }
  const { accessToken, refreshToken } = await loginTokens(request, email, password);
  await context.clearCookies();
  // No `secure` flag: these have to ride plain http://localhost regardless of
  // what NODE_ENV the dev client is running under.
  await context.addCookies([
    { name: 'access_token', value: accessToken, url: CLIENT_BASE },
    { name: 'refresh_token', value: refreshToken, url: CLIENT_BASE },
  ]);
  await dismissCookieBanner(context);
}

/**
 * Record a cookie-consent decision before the app can ask for one.
 *
 * The banner is `fixed bottom-4 … z-50` and reveals itself 5 seconds after
 * hydration (`cookie-consent-banner.tsx` REVEAL_DELAY_MS), so it silently
 * covers the save buttons at the foot of every long form partway through a run
 * — steps that finish inside 5s pass, later ones fail on an intercepted click.
 *
 * Analytics is declined: a test run should not opt a browser into tracking.
 */
export async function dismissCookieBanner(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'naga_cookie_consent_v1',
        JSON.stringify({ analytics: false, decidedAt: new Date().toISOString(), version: '1' }),
      );
    } catch {
      // Private-mode style storage failures are not worth failing a test over.
    }
  });
}

// ─── Teardown ────────────────────────────────────────────────────────────────

/** Programs this run created, newest last. Drained by the spec's afterAll. */
export const createdProgramIds: string[] = [];

export function trackProgram(id: string): void {
  if (id && !createdProgramIds.includes(id)) createdProgramIds.push(id);
}

/**
 * Delete one program. Tolerates 404 (already gone) but nothing else — a teardown
 * that swallows failures is how live junk accumulates.
 */
export async function deleteProgram(
  request: APIRequestContext,
  auth: AuthenticatedApi,
  id: string,
): Promise<void> {
  const res = await request.delete(`${API_BASE}/programs/${id}`, { headers: auth.headers });
  if (res.status() === 404) return;
  if (!res.ok()) {
    throw new Error(`Teardown failed to delete program ${id}: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Sweep every program this suite has ever left behind, not just the current run.
 * Used by the afterAll and callable on its own after a killed run:
 *   pnpm exec playwright test e2e/workflow/full-workflow.spec.ts -g "sweep"
 */
export async function sweepTestPrograms(
  request: APIRequestContext,
  auth: AuthenticatedApi,
): Promise<string[]> {
  const res = await request.get(`${API_BASE}/programs?limit=200`, { headers: auth.headers });
  if (!res.ok()) throw new Error(`Sweep could not list programs: ${res.status()}`);
  const body = (await res.json()) as { data?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>;
  const rows = Array.isArray(body) ? body : (body.data ?? []);
  const stale = rows.filter((p) => p.name?.startsWith(TEST_PREFIX));
  for (const p of stale) await deleteProgram(request, auth, p.id);
  return stale.map((p) => p.id);
}

// ─── UI widget drivers ───────────────────────────────────────────────────────
// Every dropdown in this app is a Base-UI popover over cmdk, never a native
// <select>, so `page.selectOption()` does not work anywhere. cmdk renders items
// with role="option".

/** Open a `SimpleSelect` by its trigger id and choose an option. */
export async function chooseFromSelect(
  page: Page,
  triggerId: string,
  option: string | RegExp | { first: true },
): Promise<string> {
  await page.locator(`#${triggerId}`).click();
  const listbox = page.getByRole('option');
  await expect(listbox.first()).toBeVisible();
  const target = typeof option === 'object' && 'first' in option
    ? listbox.first()
    : page.getByRole('option', { name: option as string | RegExp });
  const label = (await target.innerText()).trim();
  await target.click();
  await expect(page.getByRole('option')).toHaveCount(0);
  return label;
}

/**
 * Pick an entry in a `MultiSelectCombobox`. The trigger is a div (so the chip
 * remove-buttons aren't nested in a button), identified by aria-haspopup.
 */
export async function chooseFromMultiSelect(
  page: Page,
  opts: { searchPlaceholder: string; query: string; hasText: string; nth?: number },
): Promise<void> {
  await page.locator('[aria-haspopup="listbox"]').nth(opts.nth ?? 0).click();
  const search = page.getByPlaceholder(opts.searchPlaceholder);
  await expect(search).toBeVisible();
  await search.fill(opts.query);
  // hasText (substring) rather than an accessible-name regex: option names here
  // are label+sublabel concatenated, and several offices share a prefix.
  const option = page.getByRole('option').filter({ hasText: opts.hasText }).first();
  await expect(option).toBeVisible();
  await option.click();
  await page.keyboard.press('Escape');
}

/** Read a program's status straight from the API — cheaper than scraping a drawer. */
export async function programStatus(
  request: APIRequestContext,
  auth: AuthenticatedApi,
  id: string,
): Promise<string> {
  const res = await request.get(`${API_BASE}/programs/${id}`, { headers: auth.headers });
  expect(res.ok(), `GET /programs/${id} → ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { status: string }).status;
}

export async function programProjectActivities(
  request: APIRequestContext,
  auth: AuthenticatedApi,
  id: string,
): Promise<Array<{ id: string; name: string; type: string; proposedBudget: string }>> {
  const res = await request.get(`${API_BASE}/programs/${id}`, { headers: auth.headers });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    projectActivities?: Array<{ id: string; name: string; type: string; proposedBudget: string }>;
  };
  return body.projectActivities ?? [];
}
