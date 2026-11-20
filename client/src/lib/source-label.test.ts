import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLabel } from './source-label.ts';

test('labels a sheet row, a paged row and a table row', () => {
  assert.equal(sourceLabel({ ref: 'ECON!r305', page: null }), 'ECON r305');
  assert.equal(sourceLabel({ ref: 'row 7', page: 3 }), 'p. 3 · row 7');
  assert.equal(sourceLabel({ ref: 'table 2 row 11' }), 'table 2 row 11');
  assert.equal(sourceLabel({ ref: '', page: 12 }), 'p. 12');
});
