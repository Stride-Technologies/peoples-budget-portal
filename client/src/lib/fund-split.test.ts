import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectActivitySchema, fundSplitIssue, toFundAllocations } from './schemas.ts';

const line = (fundSource: string, co = '0.00') => ({ fundSource, ps: '0.00', mooe: '0.00', co });

test('a split needs two distinct named funds and some money', () => {
  assert.match(fundSplitIssue([line('GF', '3')]) ?? '', /at least two/);
  assert.match(fundSplitIssue([line('GF', '3'), line('', '2')]) ?? '', /every line/);
  assert.match(fundSplitIssue([line('GF', '3'), line('GF', '2')]) ?? '', /once/);
  assert.match(fundSplitIssue([line('GF'), line('SHF')]) ?? '', /amount/);
  assert.equal(fundSplitIssue([line('GF', '3'), line('SHF', '2')]), null);
});

test('a split PPA validates on its lines, not on the one-total fields', () => {
  const base = {
    entryType: 'activity',
    aipReferenceCode: '3000-2-02-20-003-001-001',
    projectActivityName: 'Hospital expansion',
    fundSources: [],
    costMode: 'DIRECT_COSTS',
    lineItems: [],
  };
  // No estimates and no fund list: fine when split, because the lines carry both.
  const split = addProjectActivitySchema.safeParse({
    ...base,
    splitByFund: true,
    fundAllocations: [line('GF', '3.00'), line('SHF', '2.00')],
  });
  assert.equal(split.success, true);
  // An SHF row (once outside the PPA enum) is accepted as one total too.
  const total = addProjectActivitySchema.safeParse({
    ...base,
    fundSources: ['SHF'],
    coEstimate: '5.00',
  });
  assert.equal(total.success, true);
  const bad = addProjectActivitySchema.safeParse({
    ...base,
    splitByFund: true,
    fundAllocations: [line('GF', '3.00')],
  });
  assert.equal(bad.success, false);
});

test('blank amounts go on the wire as zero', () => {
  assert.deepEqual(toFundAllocations([{ fundSource: 'GF', ps: '', mooe: '1.00', co: undefined }]), [
    { fundSource: 'GF', ps: '0.00', mooe: '1.00', fe: '0.00', co: '0.00' },
  ]);
});
