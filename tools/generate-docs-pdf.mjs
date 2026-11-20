#!/usr/bin/env node
/**
 * Docs → PDF pipeline.
 * Stages: Mermaid pre-render → Markdown→HTML → Puppeteer A4 PDF.
 * Usage:  pnpm docs:pdf
 * Output: docs/dist/{architecture,modules,manual,operations}.pdf
 *         docs/dist/peoples-budget-portal-complete.pdf
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import puppeteer, { executablePath as puppeteerExecPath } from 'puppeteer';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..');
const docsDir = join(repoRoot, 'docs');
const distDir = join(docsDir, 'dist');
const MMDC = join(repoRoot, 'node_modules', '.bin', 'mmdc');

const SECTIONS = [
  {
    name: 'architecture',
    title: 'Architecture',
    files: [
      'README.md',
      'architecture/overview.md',
      'architecture/data-model.md',
      'architecture/workflow.md',
      'architecture/frontend.md',
    ],
  },
  {
    name: 'modules',
    title: 'Modules Reference',
    files: [
      'modules/README.md',
      'modules/auth.md',
      'modules/users.md',
      'modules/admin.md',
      'modules/public.md',
      'modules/aip-registry.md',
      'modules/lfc.md',
      'modules/aip-cycles.md',
      'modules/aip-codes.md',
      'modules/programs.md',
      'modules/project-activities.md',
      'modules/line-items.md',
      'modules/budget-ceilings.md',
      'modules/budget-rollup.md',
      'modules/reference.md',
      'modules/comments.md',
      'modules/events.md',
      'modules/climate-tags.md',
      'modules/cache-redis.md',
      'modules/mail.md',
      'modules/health.md',
      'modules/dashboard.md',
      'modules/lgu-feedback-dashboard.md',
      'modules/ppmp.md',
      'modules/program-audit.md',
      'modules/proposed-budget.md',
      'modules/storage.md',
    ],
  },
  {
    name: 'manual',
    title: 'User Manual',
    files: [
      'manual/README.md',
      'manual/getting-started.md',
      'manual/glossary.md',
      'manual/phase-1-encoding.md',
      'manual/staff-and-permissions.md',
      'manual/aip-management.md',
      'manual/configuring-offices.md',
      'manual/proponent-lgu.md',
      'manual/administrator.md',
      'manual/public-registry.md',
    ],
  },
  {
    name: 'operations',
    title: 'Operations & Deployment',
    files: [
      'deployment-do.md',
      'deployment.md',
    ],
  },
];

// ─── Stage 1: Mermaid pre-render ──────────────────────────────────────────

let MMDC_PUPPETEER_CONFIG_FILE = null;

// `executablePath()` returns Promise<string> as of Puppeteer 25 (was a plain
// string in 24) — resolved once in main() and threaded through, since this
// runs inside a synchronous String.replace() callback that can't await.
function ensureMmdcPuppeteerConfig(chromeExecPath) {
  if (MMDC_PUPPETEER_CONFIG_FILE) return MMDC_PUPPETEER_CONFIG_FILE;
  const configPath = join(tmpdir(), `mmdc-puppeteer-${randomUUID()}.json`);
  writeFileSync(configPath, JSON.stringify({ executablePath: chromeExecPath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }), 'utf8');
  MMDC_PUPPETEER_CONFIG_FILE = configPath;
  return configPath;
}

function renderMermaidBlocks(markdown, chromeExecPath) {
  return markdown.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, diagram) => {
    const id = randomUUID();
    const inFile = join(tmpdir(), `mermaid-${id}.mmd`);
    const outFile = join(tmpdir(), `mermaid-${id}.svg`);
    writeFileSync(inFile, diagram.trim(), 'utf8');
    try {
      execFileSync(
        MMDC,
        [
          '-i', inFile,
          '-o', outFile,
          '--backgroundColor', 'white',
          '--theme', 'neutral',
          '--puppeteerConfigFile', ensureMmdcPuppeteerConfig(chromeExecPath),
        ],
        { timeout: 30_000 },
      );
      const svg = readFileSync(outFile, 'utf8')
        .replace(/<\?xml[^?]*\?>\s*/g, '')
        .trim();
      return `<div class="diagram">${svg}</div>`;
    } catch (err) {
      console.warn(`  ⚠ mermaid render failed: ${String(err).split('\n')[0]}`);
      return `<pre class="mermaid-fallback">${diagram.trim()}</pre>`;
    }
  });
}

// ─── Stage 2: Markdown → HTML ────────────────────────────────────────────

function setupMarked() {
  marked.use(
    markedHighlight({
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
}

function toBodyHtml(markdown, baseDir) {
  const html = String(marked.parse(markdown))
    // Relative .md links don't navigate in PDF — strip hrefs, keep link text
    .replace(/href="(?!https?:|mailto:|#)([^"]*)"/g, 'href="#"')
    // setContent gives the page an opaque origin, so Chromium blocks file://
    // subresources and a <base> href would not help. Inline images as data URIs
    // instead. Resolved per source file, since sections merge several folders.
    .replace(/src="(?!https?:|data:)([^"]*)"/g, (whole, src) => {
      const abs = join(baseDir, decodeURIComponent(src));
      if (!existsSync(abs)) {
        console.warn(`  ⚠ image not found: ${src}`);
        return whole;
      }
      const ext = abs.split('.').pop().toLowerCase();
      const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
      return `src="data:image/${mime};base64,${readFileSync(abs).toString('base64')}"`;
    });
  return html;
}

const PAGE_CSS = `
  @page { size: A4; margin: 24mm 18mm 22mm 18mm; }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.65; color: #1a1a1a; margin: 0;
  }
  h1 {
    font-size: 22pt; color: #1e3a5f;
    border-bottom: 2.5px solid #1e3a5f; padding-bottom: 6px;
    margin-top: 0; page-break-before: always;
  }
  h1:first-of-type { page-break-before: avoid; }
  h2 {
    font-size: 15pt; color: #1e3a5f;
    border-bottom: 1px solid #b8cfe8; padding-bottom: 4px;
    margin-top: 24px; page-break-after: avoid;
  }
  h3 { font-size: 12.5pt; color: #2c4a6e; margin-top: 18px; page-break-after: avoid; }
  h4, h5, h6 { font-size: 11pt; color: #2c4a6e; margin-top: 14px; page-break-after: avoid; }
  p { margin: 8px 0; }
  table {
    width: 100%; border-collapse: collapse;
    margin: 14px 0; font-size: 9.5pt; page-break-inside: auto;
  }
  thead tr { background: #1e3a5f; color: white; }
  th { padding: 8px 10px; text-align: left; font-weight: 600; border: 1px solid #1a3458; }
  tbody tr:nth-child(even) { background: #f2f6fb; }
  td { padding: 7px 10px; border: 1px solid #c5d5e8; vertical-align: top; }
  code {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace;
    font-size: 8.5pt; background: #f3f4f6;
    padding: 1px 5px; border-radius: 3px; color: #c0392b;
  }
  pre {
    background: #1e1e2e; color: #cdd6f4;
    padding: 12px 14px; border-radius: 6px;
    font-size: 8pt; line-height: 1.5;
    page-break-inside: avoid; overflow-x: hidden;
    white-space: pre-wrap; word-break: break-all;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
  img {
    max-width: 100%; height: auto; display: block;
    margin: 14px auto; border: 1px solid #d5dde7; border-radius: 4px;
    page-break-inside: avoid;
  }
  .diagram { margin: 16px auto; text-align: center; page-break-inside: avoid; }
  .diagram svg { max-width: 100%; height: auto; }
  .mermaid-fallback {
    background: #f9f9f9; border: 1px dashed #ccc;
    padding: 12px; font-size: 8pt; color: #666; white-space: pre-wrap;
  }
  blockquote {
    border-left: 4px solid #b8cfe8; margin: 12px 0;
    padding: 8px 16px; background: #f4f7fb; color: #555;
  }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
  hr { border: none; border-top: 1px solid #dde3ea; margin: 20px 0; }
  a { color: #1e3a5f; }
  /* highlight.js token colours (dark pre background) */
  .hljs-keyword, .hljs-selector-tag { color: #cba6f7; }
  .hljs-string, .hljs-attr { color: #a6e3a1; }
  .hljs-comment { color: #6c7086; font-style: italic; }
  .hljs-number, .hljs-literal { color: #fab387; }
  .hljs-title, .hljs-class .hljs-title { color: #89b4fa; }
  .hljs-type { color: #f38ba8; }
  .hljs-built_in { color: #89dceb; }
`;

function wrapHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — People&#39;s Budget Portal</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ─── Stage 3: Puppeteer PDF ───────────────────────────────────────────────

async function printToPdf(html, outPath, headerTitle, chromeExecPath) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromeExecPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8pt;color:#999;width:100%;padding:0 18mm;text-align:right;font-family:Arial,sans-serif;">${headerTitle} — People&#39;s Budget Portal</div>`,
      footerTemplate: `<div style="font-size:8pt;color:#999;width:100%;padding:0 18mm;text-align:center;font-family:Arial,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: '18mm', bottom: '16mm', left: '18mm', right: '18mm' },
    });
  } finally {
    await browser.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(MMDC)) {
    console.error('mmdc not found — run `pnpm install` first.');
    process.exit(1);
  }

  setupMarked();
  mkdirSync(distDir, { recursive: true });

  const chromeExecPath = await puppeteerExecPath();
  const allBodies = [];

  for (const { name, title, files } of SECTIONS) {
    console.log(`\n[${title}]`);
    const bodies = [];

    for (const file of files) {
      const absPath = join(docsDir, file);
      if (!existsSync(absPath)) {
        console.warn(`  ⚠ not found: ${file}`);
        continue;
      }
      process.stdout.write(`  ${file}...`);
      let md = readFileSync(absPath, 'utf8');
      md = renderMermaidBlocks(md, chromeExecPath);
      bodies.push(toBodyHtml(md, dirname(absPath)));
      process.stdout.write(' ok\n');
    }

    const bodyHtml = bodies.join('\n<hr>\n');
    allBodies.push(bodyHtml);

    const outPath = join(distDir, `${name}.pdf`);
    process.stdout.write(`  → printing ${name}.pdf...`);
    await printToPdf(wrapHtml(bodyHtml, title), outPath, title, chromeExecPath);
    console.log(' done');
  }

  console.log('\n[Complete]');
  process.stdout.write('  → printing peoples-budget-portal-complete.pdf...');
  await printToPdf(
    wrapHtml(allBodies.join('\n<hr>\n'), 'Complete Documentation'),
    join(distDir, 'peoples-budget-portal-complete.pdf'),
    'Complete Documentation',
    chromeExecPath,
  );
  console.log(' done');

  console.log('\nAll PDFs written to docs/dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
