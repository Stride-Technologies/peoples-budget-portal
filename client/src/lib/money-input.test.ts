import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyInput } from './money-input.ts';

test('reads an amount as typed into the API decimal string', () => {
  assert.equal(parseMoneyInput('₱ 2,600,000,000'), '2600000000');
  assert.equal(parseMoneyInput('1234567.89'), '1234567.89');
  for (const bad of ['', '0', '0.00', '-5', '1.234', '2.6e9', 'abc']) assert.equal(parseMoneyInput(bad), null, bad);
});
