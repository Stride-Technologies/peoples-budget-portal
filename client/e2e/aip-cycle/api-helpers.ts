import { expect, type APIRequestContext } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { loadApiEnv } from './db-helpers';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthenticatedApi = {
  accessToken: string;
  headers: {
    Authorization: string;
  };
};

export function apiBaseUrl() {
  const apiPort = process.env.AIP_E2E_API_PORT ?? '8010';
  return process.env.API_URL ?? `http://localhost:${apiPort}/api/v1`;
}

/**
 * Sign in through the real flow. A SUPER_ADMIN always confirms an emailed code
 * (MFA), and others do every EMAIL_VERIFICATION_DAYS, so a login can answer
 * 401 "… verification required". The suite then reads the code the way a
 * developer would: from the API's console mail (`MAIL_PROVIDER` unset or
 * `console`, as under NODE_ENV=test), whose output must go to the file named by
 * `E2E_API_LOG`, e.g. `node dist/src/main.js > /tmp/api.log`. MFA is never
 * switched off for tests.
 */
export async function loginTokens(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<TokenPair> {
  const logPath = process.env.E2E_API_LOG;
  const logStart = logPath && existsSync(logPath) ? statSync(logPath).size : 0;
  const response = await request.post(`${apiBaseUrl()}/auth/login`, {
    data: { email, password },
  });
  let tokens: TokenPair;
  if (response.status() === 401) {
    const { message, challenge } = (await response.json().catch(() => ({}))) as {
      message?: string;
      challenge?: string;
    };
    if (!/verification required/i.test(message ?? '')) {
      throw new Error(`Login failed: ${message ?? 401}`);
    }
    if (!logPath) {
      throw new Error(
        'This account must confirm an emailed sign-in code. Run the API with console mail ' +
          '(NODE_ENV=test) writing to a file, and set E2E_API_LOG to that file.',
      );
    }
    const code = await codeFromLog(logPath, logStart, email);
    const verified = await request.post(`${apiBaseUrl()}/auth/verify-email`, {
      data: { email, code, challenge },
    });
    expect(verified.status()).toBe(200);
    tokens = (await verified.json()) as TokenPair;
  } else {
    expect(response.status()).toBe(200);
    tokens = (await response.json()) as TokenPair;
  }
  expect(tokens.accessToken).toBeTruthy();
  expect(tokens.refreshToken).toBeTruthy();
  return tokens;
}

/** The sign-in code console mail logged for `email` after `from` bytes. */
async function codeFromLog(path: string, from: number, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    // eslint-disable-next-line no-control-regex
    const text = readFileSync(path).subarray(from).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
    const blocks = text.split('=== [DEV MAIL] ===').slice(1);
    const mine = blocks.filter((b) => new RegExp(`^\\s*To:\\s*${escapeRe(email)}\\s*$`, 'im').test(b));
    const code = mine.length ? /\b(\d{6})\b/.exec(mine[mine.length - 1].split(/^Text:/m)[1] ?? '')?.[1] : null;
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code for ${email} in ${path}. Is the API's console mail going there?`);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function loginWithCredentials(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthenticatedApi> {
  const { accessToken } = await loginTokens(request, email, password);
  return {
    accessToken,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function loginAsSuperAdmin(
  request: APIRequestContext,
): Promise<AuthenticatedApi> {
  loadApiEnv();
  const email = process.env.AIP_E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password =
    process.env.AIP_E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing admin credentials. Set AIP_E2E_ADMIN_EMAIL/AIP_E2E_ADMIN_PASSWORD or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD in api/.env.',
    );
  }

  return loginWithCredentials(request, email, password);
}

export async function expectApiStatus(
  response: { status: () => number; text: () => Promise<string> },
  expectedStatus: number,
) {
  const actual = response.status();
  if (actual !== expectedStatus) {
    throw new Error(
      `Expected API status ${expectedStatus}, got ${actual}: ${await response.text()}`,
    );
  }
}
