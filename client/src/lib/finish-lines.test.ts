import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INK, VISIONS, readableOn } from './finish-lines.ts';

test('every finish-line colour gets a foreground that clears WCAG AA', () => {
  // Measured, not assumed: white fails on four of the eight — amber is 1.79:1.
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  for (const vision of VISIONS) {
    const fg = readableOn(vision.color);
    const r = ratio(fg, vision.color);
    assert.ok(
      r >= 4.5,
      `${vision.num} ${vision.color} on ${fg} is ${r.toFixed(2)}:1, below 4.5`,
    );
  }
});

test('readableOn picks ink for light colours and white for dark ones', () => {
  assert.equal(readableOn('#FFB300'), INK); // amber — white would be 1.79:1
  assert.equal(readableOn('#26BDE2'), INK); // cyan
  assert.equal(readableOn('#4C9F38'), INK); // green
  assert.equal(readableOn('#FD6925'), INK); // orange
  assert.equal(readableOn('#A21942'), '#FFFFFF'); // rose
  assert.equal(readableOn('#00689D'), '#FFFFFF'); // sky
});
