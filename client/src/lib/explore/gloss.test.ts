import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gloss } from './gloss.ts';

test('marks a budget term at its first use only, acronyms by case, longest term first', () => {
  const seen = new Set<string>();
  const a = gloss('The FY2027 AIP sets aside Capital Outlay; the AIP and its CO lines.', seen);
  assert.deepEqual(
    a.filter((p) => p.entry).map((p) => p.text),
    ['AIP', 'Capital Outlay'],
  );
  assert.equal(a.map((p) => p.text).join(''), 'The FY2027 AIP sets aside Capital Outlay; the AIP and its CO lines.');
  // seen carries across sentences of one reply
  assert.deepEqual(gloss('More AIP money.', seen).filter((p) => p.entry), []);
  assert.deepEqual(gloss('a co-op and Estimated cost').filter((p) => p.entry).map((p) => p.text), ['Estimated cost']);
});
