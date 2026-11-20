import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jsonLdHtml } from './seo.ts';

test('jsonLdHtml keeps a script-closing payload inert and the JSON unchanged', () => {
  const value = { name: '</script><script>alert(1)</script> & <!-- \u2028' };
  const html = jsonLdHtml(value);
  assert.ok(!/[<>&\u2028\u2029]/.test(html), html);
  assert.deepEqual(JSON.parse(html), value);
});

test('every JSON-LD script goes through jsonLdHtml', () => {
  const srcDir = new URL('../', import.meta.url);
  const offenders = (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((p) => /\.tsx$/.test(p))
    .filter((p) => {
      const text = readFileSync(new URL(p, srcDir), 'utf8');
      return text.includes('application/ld+json') && /__html:\s*JSON\.stringify/.test(text);
    });
  assert.deepEqual(offenders, [], 'use jsonLdHtml() for <script type="application/ld+json">');
});
