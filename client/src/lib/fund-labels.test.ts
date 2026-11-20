import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundName, papClassName, programFunds } from './fund-labels.ts';

test('fund codes read as names, unknown codes pass through', () => {
  assert.equal(fundName('GF'), 'General Fund (GF)');
  assert.equal(fundName('TRUST_FUND'), 'Trust Fund');
  assert.equal(fundName('XYZ'), 'XYZ');
});

test("a program's funds include every PPA's, once, in catalogue order", () => {
  assert.deepEqual(
    programFunds({ fundSources: [], projectActivities: [{ fundSources: ['LDF'] }, { fundSources: ['GF', 'LDF'] }, {}] }),
    ['GF', 'LDF'],
  );
});

test('PAP class reads as its section name', () => {
  assert.equal(papClassName('STO'), 'Support to Operations');
  assert.equal(papClassName(null), null);
});
