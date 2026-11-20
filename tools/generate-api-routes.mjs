#!/usr/bin/env node
/**
 * Generates api/docs/api-routes.md by scanning NestJS controller files.
 *
 * Parses @Controller / @Get / @Post / @Patch / @Put / @Delete decorators plus
 * @Roles metadata. This is a static scan — it does not boot the app — so it is
 * fast and safe to run in a pre-commit hook.
 *
 * Usage: node tools/generate-api-routes.mjs
 * Wired into .husky/pre-commit: regenerates whenever a *.controller.ts is staged.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..');
const srcDir = join(repoRoot, 'api', 'src');
const outFile = join(repoRoot, 'api', 'docs', 'api-routes.md');
const GLOBAL_PREFIX = 'api/v1';

const HTTP_DECORATORS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

/** Recursively collect *.controller.ts files. */
function findControllers(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'generated' || entry === 'dist') continue;
      out.push(...findControllers(full));
    } else if (entry.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Join base + sub path segments into a normalized /-prefixed path. */
function joinPath(...segments) {
  const parts = [];
  for (const seg of segments) {
    if (!seg) continue;
    for (const piece of seg.split('/')) {
      if (piece) parts.push(piece);
    }
  }
  return '/' + parts.join('/');
}

/** Extract the string literal argument from a decorator, or '' if none. */
function decoratorArg(line) {
  const m = line.match(/\(\s*['"`]([^'"`]*)['"`]/);
  return m ? m[1] : '';
}

function scanController(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // Controller base path
  let basePath = '';
  const ctrlMatch = text.match(/@Controller\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/);
  if (ctrlMatch) basePath = ctrlMatch[1] ?? '';

  // Class-level @Roles (applies to all routes unless overridden)
  const classRolesMatch = text.match(/@Roles\(([^)]*)\)\s*\n\s*@ApiTags|@ApiTags[^\n]*\n[^\n]*@Roles\(([^)]*)\)/);
  void classRolesMatch; // class-level roles are rare here; per-route scan below covers it

  const routes = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const decoratorMatch = line.match(/^@(Get|Post|Put|Patch|Delete)\(/);
    if (!decoratorMatch) continue;
    const method = decoratorMatch[1].toUpperCase();
    const subPath = decoratorArg(line);

    // The decorators for one handler form a contiguous block. Walk up to the
    // block start and down to the handler signature, collecting every line in
    // between — decorator order (@Roles before or after @Get) doesn't matter.
    let blockStart = i;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j].trim();
      if (prev.startsWith('@')) {
        blockStart = j;
        continue;
      }
      if (prev === '') continue; // tolerate blank lines between decorators
      break;
    }
    let blockEnd = i;
    for (let j = i + 1; j < lines.length && j < i + 20; j++) {
      blockEnd = j;
      if (/^\s*(public\s+|private\s+|protected\s+)?(async\s+)?[a-zA-Z0-9_]+\s*\(/.test(lines[j])
          && !lines[j].trim().startsWith('@')) {
        break;
      }
    }
    const block = lines.slice(blockStart, blockEnd + 1).join('\n');

    let roles = '';
    const rolesMatch = block.match(/@Roles\(([^)]*)\)/);
    if (rolesMatch) {
      roles = rolesMatch[1]
        .split(',')
        .map((r) => r.trim().replace(/^Role\./, ''))
        .filter(Boolean)
        .join(', ');
    }
    const isPublic = /@Public\(\)/.test(block);

    // Phase 1: the permission key is the primary authorization signal; @Roles is
    // kept alongside during the migration (phase-1-publish-scope.md §5.3).
    const permMatch = block.match(/@RequirePermission\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    const permission = permMatch ? permMatch[1] : '';

    let summary = '';
    const sumMatch = block.match(/summary:\s*['"`]([^'"`]*)['"`]/);
    if (sumMatch) summary = sumMatch[1];

    routes.push({
      method,
      path: joinPath(GLOBAL_PREFIX, basePath, subPath),
      roles: isPublic ? 'PUBLIC' : roles || 'any authenticated',
      permission: isPublic ? '—' : permission || '—',
      summary,
    });
  }
  return routes;
}

function main() {
  const controllers = findControllers(srcDir).sort();
  const sections = [];

  for (const file of controllers) {
    const routes = scanController(file);
    if (routes.length === 0) continue;
    const rel = relative(repoRoot, file);
    sections.push({ rel, routes });
  }

  const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  let totalRoutes = 0;

  let md = `# API Routes\n\n`;
  md += `> **AUTO-GENERATED — do not hand-edit.**\n`;
  md += `> Regenerated by \`tools/generate-api-routes.mjs\` (run via \`pnpm docs:routes\` or the pre-commit hook).\n`;
  md += `> Global prefix: \`/${GLOBAL_PREFIX}\`. All routes require a Bearer JWT unless marked \`@Public\`.\n`;
  md += `> **Permission** is the \`@RequirePermission()\` key checked by \`PermissionGuard\`; \`—\` means the route is not yet migrated and \`@Roles\` alone gates it.\n\n`;

  for (const { rel, routes } of sections) {
    routes.sort(
      (a, b) =>
        (methodOrder[a.method] ?? 9) - (methodOrder[b.method] ?? 9) ||
        a.path.localeCompare(b.path),
    );
    md += `## \`${rel}\`\n\n`;
    md += `| Method | Path | Permission | Roles | Summary |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const r of routes) {
      totalRoutes++;
      const perm = r.permission === '—' ? '—' : `\`${r.permission}\``;
      md += `| ${r.method} | \`${r.path}\` | ${perm} | ${r.roles} | ${r.summary || '—'} |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n_${totalRoutes} routes across ${sections.length} controllers._\n`;

  writeFileSync(outFile, md);
  console.log(`Wrote ${relative(repoRoot, outFile)} — ${totalRoutes} routes, ${sections.length} controllers.`);
}

main();
