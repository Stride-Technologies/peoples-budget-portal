import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPortalPdf, sourcePdfHref } from './source-pdf.ts';

const PREFIX = 'https://www.example.gov.ph/wp-content/uploads/';
const SCAN = `${PREFIX}2025/06/OFFICE-OF-THE-CITY-MAYOR.pdf`;

test('opens a posted PDF in the viewer at its page', () => {
  assert.equal(
    sourcePdfHref({ url: `${SCAN}#page=1`, page: 2 }, PREFIX),
    `/api/source-pdf?url=${encodeURIComponent(SCAN)}#page=2`,
  );
  assert.equal(sourcePdfHref({ url: SCAN, page: null }, PREFIX), `/api/source-pdf?url=${encodeURIComponent(SCAN)}`);
});

test('leaves every other source as a plain link', () => {
  assert.equal(sourcePdfHref({ url: 'https://docs.google.com/spreadsheets/d/x#gid=1&range=A5', page: null }, PREFIX), null);
  assert.equal(sourcePdfHref({ url: null, page: 3 }, PREFIX), null);
});

test('proxies nothing but PDFs under the configured prefix', () => {
  assert.equal(isPortalPdf(SCAN, PREFIX), true);
  for (const bad of [
    'http://www.example.gov.ph/wp-content/uploads/a.pdf', // not https
    'https://www.example.gov.ph.evil.test/wp-content/uploads/a.pdf',
    'https://evil.test/https://www.example.gov.ph/wp-content/uploads/a.pdf',
    'https://www.example.gov.ph/wp-content/uploads/../../wp-admin/a.pdf',
    'https://www.example.gov.ph/wp-content/uploads/a.pdf?x=1',
    'https://www.example.gov.ph/wp-content/uploads/a.php',
    'https://user@www.example.gov.ph/wp-content/uploads/a.pdf',
    'https://www.example.gov.ph/other/a.pdf',
  ])
    assert.equal(isPortalPdf(bad, PREFIX), false, bad);
});

test('proxies nothing when no prefix is configured, or the prefix is not a plain https folder', () => {
  for (const prefix of ['', 'https://', 'http://www.example.gov.ph/', 'https://user@www.example.gov.ph/', 'https://www.example.gov.ph', 'https://www.example.gov.ph/a?b=/'])
    assert.equal(isPortalPdf(`${prefix}a.pdf`, prefix), false, prefix);
});
