import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, paletteById, paletteStyle } from './palettes.ts';

const lum = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test('every preset clears WCAG AA where it carries text', () => {
  for (const p of PALETTES) {
    assert.ok(contrast('#FFFFFF', p.primary) >= 4.5, `${p.id}: white on primary`);
    assert.ok(contrast(p.primary, '#FFFFFF') >= 4.5, `${p.id}: primary text on white`);
    assert.ok(contrast(p.ink, p.fill) >= 4.5, `${p.id}: ink on fill`);
    assert.ok(contrast(p.ink, p.fillStrong) >= 4.5, `${p.id}: ink on strong fill`);
    assert.ok(contrast(p.primary, '#FDFDF8') >= 4.5, `${p.id}: primary on paper`);
  }
});

test('an unknown palette falls back to the default, never to nothing', () => {
  assert.equal(paletteById('<script>').id, 'civic-blue');
  assert.equal(paletteStyle('nope')['--primary'], paletteById('civic-blue').primary);
});

test('palette ids are unique', () => {
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
});
