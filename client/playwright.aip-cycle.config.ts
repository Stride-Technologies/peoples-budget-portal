import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const clientBaseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const apiPort = process.env.AIP_E2E_API_PORT ?? '8010';
const apiBaseUrl = process.env.API_URL ?? `http://localhost:${apiPort}/api/v1`;
const fullTrace = process.env.AIP_E2E_FULL_TRACE === '1';
const serverMode = process.env.AIP_E2E_SERVER_MODE ?? 'start';
const hasClientProductionBuild = existsSync('.next/BUILD_ID');
const apiServerCommand =
  serverMode === 'dev'
    ? 'pnpm dev:api'
    : `pnpm --filter api build && DOTENV_CONFIG_PATH=api/.env DOTENV_CONFIG_QUIET=true PORT=${apiPort} node -r dotenv/config api/dist/src/main.js`;
const clientServerCommand =
  serverMode === 'dev' || !hasClientProductionBuild
    ? 'pnpm dev:client'
    : 'pnpm --filter client start';

export default defineConfig({
  testDir: './e2e/aip-cycle',
  outputDir: './test-results/aip-cycle/playwright-output',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/aip-cycle', open: 'never' }],
  ],
  timeout: 120_000,

  use: {
    baseURL: clientBaseUrl,
    trace: fullTrace ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
  },

  metadata: {
    apiBaseUrl,
    clientBaseUrl,
  },

  projects: [
    {
      name: 'chromium-aip-cycle',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: apiServerCommand,
      cwd: '..',
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: clientServerCommand,
      cwd: '..',
      url: clientBaseUrl,
      reuseExistingServer: true,
      timeout: 120_000,
      // Point a harness-started client at the harness API so browser-driven
      // tests, injected sessions, and API-seeded data all hit the same backend.
      // (A reused dev client keeps its own API_URL; data lives in the same DB and
      // the JWT signing key is shared, so injected tokens stay valid either way.)
      env: { API_URL: apiBaseUrl },
    },
  ],
});
