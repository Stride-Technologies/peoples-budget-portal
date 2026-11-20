import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export type ScenarioStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

export type ScenarioRecord = {
  slug: string;
  title: string;
  status: ScenarioStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  notes?: string[];
  artifacts: {
    screenshots: string[];
    videos: string[];
    traces: string[];
    evidence: string[];
  };
};

type ResultsFile = {
  runId: string;
  startedAt: string;
  updatedAt: string;
  environment: {
    clientBaseUrl: string;
    apiBaseUrl: string;
    commitSha: string | null;
    destructiveEnabled: boolean;
    fullTrace: boolean;
  };
  scenarios: ScenarioRecord[];
};

const runId = process.env.AIP_E2E_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot = path.resolve('test-results/aip-cycle');
const screenshotRoot = path.join(artifactRoot, 'screenshots');
const evidenceRoot = path.join(artifactRoot, 'evidence');
const resultsPath = path.join(artifactRoot, 'results.json');
const auditPath = path.join(artifactRoot, 'audit.html');

export function getRunId() {
  return runId;
}

export function getArtifactRoot() {
  return artifactRoot;
}

export async function ensureArtifactDirs() {
  await Promise.all([
    mkdir(artifactRoot, { recursive: true }),
    mkdir(screenshotRoot, { recursive: true }),
    mkdir(evidenceRoot, { recursive: true }),
    mkdir(path.join(artifactRoot, 'snapshots'), { recursive: true }),
    mkdir(path.join(artifactRoot, 'videos'), { recursive: true }),
    mkdir(path.join(artifactRoot, 'traces'), { recursive: true }),
  ]);
}

export async function captureMilestone(
  page: Page,
  slug: string,
  step: string,
): Promise<string> {
  await ensureArtifactDirs();
  const fileName = `${runId}-${slug}-${step}.png`;
  const absolutePath = path.join(screenshotRoot, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  return path.relative(process.cwd(), absolutePath);
}

export async function writeEvidence(
  slug: string,
  label: string,
  evidence: unknown,
): Promise<string> {
  await ensureArtifactDirs();
  const fileName = `${runId}-${slug}-${label}.json`;
  const absolutePath = path.join(evidenceRoot, fileName);
  await writeFile(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return path.relative(process.cwd(), absolutePath);
}

export function monitorPageFailures(page: Page) {
  const failures: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`Console error: ${message.text()}`);
    }
  });

  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown error';
    // Aborted requests are benign: Next.js cancels RSC link prefetches and
    // in-flight navigations/SSE on every page transition. They are not failures.
    if (errorText.includes('ERR_ABORTED')) return;
    failures.push(
      `Request failed: ${request.method()} ${request.url()} (${errorText})`,
    );
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) {
      failures.push(`Unexpected ${status} response: ${url}`);
    }
  });

  return {
    failures,
    assertNoFailures() {
      if (failures.length > 0) {
        throw new Error(failures.join('\n'));
      }
    },
  };
}

export async function recordScenario(record: ScenarioRecord) {
  await ensureArtifactDirs();
  const current = await readResultsFile();
  const next: ResultsFile = {
    ...current,
    updatedAt: new Date().toISOString(),
    scenarios: [
      ...current.scenarios.filter((scenario) => scenario.slug !== record.slug),
      record,
    ],
  };
  await writeFile(resultsPath, `${JSON.stringify(next, null, 2)}\n`);
  await writeAuditHtml(next);
}

export async function withScenario(
  testInfo: TestInfo,
  slug: string,
  title: string,
  page: Page | null,
  run: (record: Pick<ScenarioRecord, 'artifacts' | 'notes'>) => Promise<void>,
) {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const workingRecord: Pick<ScenarioRecord, 'artifacts' | 'notes'> = {
    notes: [],
    artifacts: {
      screenshots: [],
      videos: [],
      traces: [],
      evidence: [],
    },
  };

  let status: ScenarioStatus = 'passed';
  try {
    await run(workingRecord);
  } catch (error) {
    status = 'failed';
    workingRecord.notes?.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (page) {
      const video = page.video();
      await page.close();
      if (video) {
        const videoPath = path.join(artifactRoot, 'videos', `${runId}-${slug}.webm`);
        await video.saveAs(videoPath);
        workingRecord.artifacts.videos.push(path.relative(process.cwd(), videoPath));
      }
    }

    const video = testInfo.attachments.find((attachment) => attachment.name === 'video');
    if (video?.path) {
      workingRecord.artifacts.videos.push(path.relative(process.cwd(), video.path));
    }

    const trace = testInfo.attachments.find((attachment) => attachment.name === 'trace');
    if (trace?.path) {
      workingRecord.artifacts.traces.push(path.relative(process.cwd(), trace.path));
    }

    const finished = Date.now();
    await recordScenario({
      slug,
      title,
      status,
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      notes: workingRecord.notes,
      artifacts: workingRecord.artifacts,
    });
  }
}

export async function recordBlockedScenario(
  slug: string,
  title: string,
  notes: string[],
) {
  const now = new Date().toISOString();
  await recordScenario({
    slug,
    title,
    status: 'blocked',
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    notes,
    artifacts: {
      screenshots: [],
      videos: [],
      traces: [],
      evidence: [],
    },
  });
}

async function writeAuditHtml(results: ResultsFile) {
  const scenarioCards = results.scenarios
    .map((scenario) => {
      const notes = scenario.notes?.length
        ? `<ul>${scenario.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
        : '<p>No notes recorded.</p>';
      const artifacts = [
        ...scenario.artifacts.evidence.map((item) => artifactLink('Evidence', item)),
        ...scenario.artifacts.screenshots.map((item) =>
          artifactLink('Screenshot', item),
        ),
        ...scenario.artifacts.videos.map((item) => artifactLink('Video', item)),
        ...scenario.artifacts.traces.map((item) => artifactLink('Trace', item)),
      ];
      const artifactList = artifacts.length
        ? `<ul>${artifacts.map((item) => `<li>${item}</li>`).join('')}</ul>`
        : '<p>No artifacts recorded.</p>';

      return `
        <section class="scenario ${escapeHtml(scenario.status)}">
          <div class="scenario-header">
            <h2>${escapeHtml(scenario.title)}</h2>
            <span>${escapeHtml(scenario.status)}</span>
          </div>
          <p><code>${escapeHtml(scenario.slug)}</code> · ${scenario.durationMs} ms</p>
          <h3>Notes</h3>
          ${notes}
          <h3>Artifacts</h3>
          ${artifactList}
        </section>
      `;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AIP Cycle Test Audit ${escapeHtml(results.runId)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, sans-serif;
      line-height: 1.4;
      color: #172033;
      background: #f7f8fb;
    }
    body {
      margin: 0;
      padding: 32px;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
    }
    h3 {
      margin: 16px 0 8px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #586174;
    }
    code {
      background: #edf0f5;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .summary {
      margin: 20px 0;
      padding: 16px;
      border: 1px solid #d8dde8;
      background: #fff;
    }
    .scenario {
      margin: 16px 0;
      padding: 16px;
      border: 1px solid #d8dde8;
      border-left: 5px solid #9aa4b5;
      background: #fff;
    }
    .scenario.passed {
      border-left-color: #16834a;
    }
    .scenario.failed {
      border-left-color: #c7362f;
    }
    .scenario.blocked {
      border-left-color: #b26a00;
    }
    .scenario-header {
      display: flex;
      gap: 12px;
      align-items: start;
      justify-content: space-between;
    }
    .scenario-header span {
      padding: 3px 8px;
      border-radius: 999px;
      background: #edf0f5;
      font-size: 12px;
      text-transform: uppercase;
    }
    a {
      color: #145eb8;
    }
  </style>
</head>
<body>
  <main>
    <h1>AIP Cycle Test Audit</h1>
    <div class="summary">
      <p><strong>Run:</strong> <code>${escapeHtml(results.runId)}</code></p>
      <p><strong>Updated:</strong> ${escapeHtml(results.updatedAt)}</p>
      <p><strong>API:</strong> <code>${escapeHtml(results.environment.apiBaseUrl)}</code></p>
      <p><strong>Client:</strong> <code>${escapeHtml(results.environment.clientBaseUrl)}</code></p>
      <p><strong>Destructive:</strong> ${String(results.environment.destructiveEnabled)}</p>
    </div>
    ${scenarioCards}
  </main>
</body>
</html>
`;

  await writeFile(auditPath, html);
}

function artifactLink(label: string, relativePath: string) {
  const href = path.relative(path.dirname(auditPath), path.resolve(relativePath));
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}: ${escapeHtml(relativePath)}</a>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function readResultsFile(): Promise<ResultsFile> {
  try {
    const existing = JSON.parse(await readFile(resultsPath, 'utf8')) as ResultsFile;
    if (existing.runId === runId) {
      return existing;
    }
  } catch {
    // Fall through to create a fresh run file.
  }

  return {
    runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    environment: {
      clientBaseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
      apiBaseUrl:
        process.env.API_URL ??
        `http://localhost:${process.env.AIP_E2E_API_PORT ?? '8010'}/api/v1`,
      commitSha: process.env.GITHUB_SHA ?? process.env.BUILD_SOURCEVERSION ?? null,
      destructiveEnabled: process.env.AIP_DESTRUCTIVE_E2E === '1',
      fullTrace: process.env.AIP_E2E_FULL_TRACE === '1',
    },
    scenarios: [],
  };
}
