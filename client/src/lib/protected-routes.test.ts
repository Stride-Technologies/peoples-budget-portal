import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PROTECTED_PREFIXES, isProtectedRoute } from './protected-routes.ts';

const appDir = new URL('../app/', import.meta.url);

/** Top-level routes a logged-out visitor is meant to reach outside `(public)/`. */
const SIGN_IN_FLOW = [
  'login',
  'verify-email',
  'set-password',
  'forgot-password',
  'reset-password',
];

test('every top-level staff route is protected', () => {
  const staff = readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('(') && !d.name.startsWith('_'))
    .map((d) => d.name)
    // A folder is a route only if it holds a page or a route handler
    // (`app/actions/` is server-action modules, not a URL).
    .filter((name) =>
      readdirSync(new URL(`${name}/`, appDir), { recursive: true, encoding: 'utf8' }).some(
        (f) => /(^|\/)(page\.tsx|route\.ts)$/.test(f),
      ),
    )
    .filter((name) => !SIGN_IN_FLOW.includes(name));
  for (const name of staff) {
    assert.ok(
      isProtectedRoute(`/${name}`),
      `/${name} is not in PROTECTED_PREFIXES — logged-out visitors would reach it. Add it, or add it to SIGN_IN_FLOW here if it is meant to be public.`,
    );
  }
});

test('public pages, the sign-in flow and unknown URLs are not protected', () => {
  for (const path of ['/', '/aip/2027/overview', '/annual/2026/browse', '/budget', '/ppmp', '/learn', '/explore', '/api/explore/export', '/api/og', '/login', '/verify-email', '/&', '/budgetBudget']) {
    assert.equal(isProtectedRoute(path), false, path);
  }
});

test('a prefix only matches whole segments', () => {
  assert.equal(isProtectedRoute('/ppmp'), false);
  assert.equal(isProtectedRoute('/ppmp-registry'), true);
  assert.equal(isProtectedRoute('/programs/abc/edit'), true);
  assert.equal(isProtectedRoute('/programsx'), false);
  assert.ok(PROTECTED_PREFIXES.includes('/api'));
});
