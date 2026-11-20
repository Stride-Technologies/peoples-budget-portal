import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENT_PROGRAMS_LABEL,
  expandableKeysIn,
  groupByOffice,
  officeGroupKey,
  officeKeysMatching,
  UNASSIGNED_OFFICE_KEY,
  type GroupableEntry,
} from './aip-grouping.ts';

function entry(
  id: string,
  office: string | null,
  papClass: GroupableEntry['papClass'],
  total = '1.00',
): GroupableEntry {
  return {
    id,
    office_id: office,
    office_name: office ? `Office of the ${office}` : null,
    office_acronym: office ? office.toUpperCase() : null,
    papClass,
    total_amount: total,
  };
}

test('keeps offices in the order the server sent them', () => {
  // The server orders by office.acronym; re-sorting here would hide a change to
  // that ordering rather than surface it.
  const groups = groupByOffice([
    entry('1', 'ceo', 'GAS'),
    entry('2', 'cho', 'GAS'),
    entry('3', 'ceo', 'STO'),
  ]);

  assert.deepEqual(
    groups.map((g) => g.officeId),
    ['ceo', 'cho'],
  );
});

test('orders sections GAS then STO then OPERATIONS, whatever order they arrive in', () => {
  const groups = groupByOffice([
    entry('1', 'ceo', 'OPERATIONS'),
    entry('2', 'ceo', 'GAS'),
    entry('3', 'ceo', 'STO'),
  ]);

  assert.deepEqual(
    groups[0].sections.map((s) => s.papClass),
    ['GAS', 'STO', 'OPERATIONS'],
  );
});

test('folds a null papClass into Operations rather than a fourth section', () => {
  const groups = groupByOffice([
    entry('1', 'ceo', null),
    entry('2', 'ceo', undefined),
    entry('3', 'ceo', 'OPERATIONS'),
  ]);

  assert.equal(groups[0].sections.length, 1);
  assert.equal(groups[0].sections[0].papClass, 'OPERATIONS');
  assert.equal(groups[0].sections[0].programs.length, 3);
});

test('omits sections with no programs', () => {
  const groups = groupByOffice([entry('1', 'ceo', 'STO')]);

  assert.deepEqual(
    groups[0].sections.map((s) => s.label),
    ['II. SUPPORT TO OPERATIONS'],
  );
});

test('programCount counts every program, across sections', () => {
  const groups = groupByOffice([
    entry('1', 'ceo', 'GAS'),
    entry('2', 'ceo', 'STO'),
    entry('3', 'ceo', 'OPERATIONS'),
    entry('4', 'ceo', 'OPERATIONS'),
  ]);

  assert.equal(groups[0].programCount, 4);
  const inSections = groups[0].sections.reduce(
    (n, s) => n + s.programs.length,
    0,
  );
  assert.equal(inSections, 4);
});

test('office totals are exact, and add up to the whole', () => {
  // Centavo arithmetic, not floats: 0.1 + 0.2 === 0.30000000000000004.
  const groups = groupByOffice([
    entry('1', 'ceo', 'GAS', '0.10'),
    entry('2', 'ceo', 'STO', '0.20'),
    entry('3', 'cho', 'GAS', '2406020000.00'),
  ]);

  assert.equal(groups[0].total, '0.30');
  assert.equal(groups[1].total, '2406020000.00');
});

test('puts programs with no office last, and does not drop them', () => {
  // The registry footer counts them, so hiding them would stop the sections
  // adding up to the total on screen.
  const groups = groupByOffice([
    entry('1', null, 'GAS'),
    entry('2', 'ceo', 'GAS'),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[1].officeId, null);
  assert.equal(groups[1].programCount, 1);
});

test('groups nothing into nothing', () => {
  assert.deepEqual(groupByOffice([]), []);
});

test('carries both the acronym and the full name', () => {
  // A dozen city offices are named "Office of the City …", so a truncated full
  // name identifies nothing — the UI labels with the acronym and keeps the full
  // name for the places with room for it.
  const groups = groupByOffice([entry('1', 'ceo', 'GAS')]);

  assert.equal(groups[0].officeAcronym, 'CEO');
  assert.equal(groups[0].officeName, 'Office of the ceo');
});

test('falls back to the full name when an acronym is missing', () => {
  // A long label beats an anonymous one.
  const groups = groupByOffice([
    { ...entry('1', 'ceo', 'GAS'), office_acronym: null },
  ]);

  assert.equal(groups[0].officeAcronym, 'Office of the ceo');
});

test('labels an office-less group rather than leaving it blank', () => {
  const groups = groupByOffice([entry('1', null, 'GAS')]);

  assert.equal(groups[0].officeAcronym, 'No implementing office');
  assert.equal(groups[0].officeName, 'No implementing office');
});

test('expandableKeysIn reaches every level, and only rows that open', () => {
  // Opening an office shows its whole tree, so the toggle needs the office key
  // plus every program and every project that has children of its own. A leaf
  // has nothing to open and must not be included.
  type Nested = GroupableEntry & { children?: Nested[] };
  const program: Nested = {
    ...entry('program', 'ceo', 'GAS'),
    children: [
      {
        ...entry('project-with-children', 'ceo', 'GAS'),
        children: [entry('leaf-activity', 'ceo', 'GAS') as Nested],
      },
      entry('project-without-children', 'ceo', 'GAS') as Nested,
    ],
  };

  const keys = expandableKeysIn(groupByOffice<Nested>([program])[0]);

  assert.deepEqual(keys, ['ceo', 'program', 'project-with-children']);
  assert.ok(!keys.includes('leaf-activity'));
  assert.ok(!keys.includes('project-without-children'));
});

test('expandableKeysIn returns just the office key when nothing nests', () => {
  const groups = groupByOffice([entry('1', 'ceo', 'GAS')]);
  assert.deepEqual(expandableKeysIn(groups[0]), ['ceo']);
});

test('expandableKeysIn uses the unassigned key for office-less programs', () => {
  const groups = groupByOffice([entry('1', null, 'GAS')]);
  assert.deepEqual(expandableKeysIn(groups[0]), [UNASSIGNED_OFFICE_KEY]);
  assert.equal(officeGroupKey(null), UNASSIGNED_OFFICE_KEY);
});

test('officeKeysMatching returns only offices holding a match', () => {
  const groups = groupByOffice([
    entry('keep', 'ceo', 'GAS'),
    entry('skip', 'cho', 'GAS'),
    entry('orphan', null, 'GAS'),
  ]);

  assert.deepEqual(
    officeKeysMatching(groups, (e) => e.id === 'keep'),
    ['ceo'],
  );
  // The unassigned group is addressable by a stable key, not by `null`.
  assert.deepEqual(
    officeKeysMatching(groups, (e) => e.id === 'orphan'),
    [UNASSIGNED_OFFICE_KEY],
  );
  assert.deepEqual(
    officeKeysMatching(groups, () => false),
    [],
  );
});

test('groups a component program under its host, in its own band', () => {
  // City Health Office II's programs print inside CHO's sheet, below CHO's own
  // three sections — the way the city's Annual Budget lays them out.
  const component: GroupableEntry = {
    ...entry('2', 'cho2', 'GAS'),
    host_office_id: 'cho',
    host_office_name: 'City Health Office',
    host_office_acronym: 'CHO',
  };

  const groups = groupByOffice([entry('1', 'cho', 'GAS'), component]);

  // One group, not two: the component program never gets a sheet of its own.
  assert.deepEqual(
    groups.map((g) => g.officeId),
    ['cho'],
  );
  assert.deepEqual(
    groups[0].sections.map((s) => s.label),
    ['I. GENERAL ADMINISTRATIVE SERVICES', COMPONENT_PROGRAMS_LABEL],
  );
  // It stays out of the host's GAS section even though its own papClass is GAS.
  assert.deepEqual(groups[0].sections[0].programs.map((p) => p.id), ['1']);
  assert.deepEqual(groups[0].sections[1].programs.map((p) => p.id), ['2']);
  assert.equal(groups[0].programCount, 2);
});

test('labels the host group by the host office, not the proponent', () => {
  const groups = groupByOffice([
    {
      ...entry('1', 'cho2', 'GAS'),
      host_office_id: 'cho',
      host_office_name: 'City Health Office',
      host_office_acronym: 'CHO',
    },
  ]);

  assert.equal(groups[0].officeAcronym, 'CHO');
  assert.equal(groups[0].officeName, 'City Health Office');
});

test('sums the office subtotal from the field the caller nominates', () => {
  // The public table shows Proposed, not Total, and grandTotal is 0 there while
  // line items are hidden — so a header summing total_amount would read 0.000
  // above rows showing real money.
  type WithProposed = GroupableEntry & { proposedBudget: string };
  const rows: WithProposed[] = [
    { ...entry('1', 'ceo', 'GAS', '0.00'), proposedBudget: '1000.25' },
    { ...entry('2', 'ceo', 'STO', '0.00'), proposedBudget: '2000.50' },
  ];

  assert.equal(groupByOffice(rows)[0].total, '0.00');
  assert.equal(
    groupByOffice(rows, (row) => row.proposedBudget)[0].total,
    '3000.75',
  );
});
