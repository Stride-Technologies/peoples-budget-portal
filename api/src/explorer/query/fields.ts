/**
 * What each source exposes (specs/018 redesign P2): its fields, their role
 * (dimension or money), and which document kinds have them. This is the
 * workspace's field list, the validator's vocabulary and the AI's schema.
 * Only public fields are here — the open-data rule (named fields, never a
 * spread row) applies: no ids of people, no `sourceRef`, no remarks.
 */
import type { Dimension, DocumentKind } from '../view.js';
import { GOAL } from '../../common/brand.js';

export const SOURCE_IDS = [
  'aip-programs',
  'aip-activities',
  'climate-tags',
  'budget-ppas',
  'object-lines',
  'receipts',
  'over-time',
  'projects',
  'terms',
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export interface FieldDef {
  id: string;
  label: string;
  role: 'dimension' | 'money';
  /** `code` = a catalogue value; `text` = a name; `split` = fund/class (see the design). */
  type: 'code' | 'text' | 'year' | 'kind' | 'split' | 'money';
  /** The catalogue dimension whose values (and labels) a `code` field uses. */
  catalogue?: Dimension;
  /** A record can carry several values (themes, topics): no totals across it. */
  multi?: boolean;
  /** Kinds the field exists on; absent = every kind of the source. */
  kinds?: DocumentKind[];
  /** Glossary term for the workspace's tooltip (W6), as `client/src/lib/glossary.ts` names it. */
  term?: string;
  /**
   * Made by the explorer (labels, topics, barangays, words), not the city's
   * own data: Records shows it only in a row's details, under its own heading.
   */
  derived?: boolean;
}

export interface SourceDef {
  id: SourceId;
  label: string;
  /** What one record is. */
  grain: string;
  kinds: DocumentKind[];
  fields: FieldDef[];
}

const code = (
  id: Dimension,
  label: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({
  id,
  label,
  role: 'dimension',
  type: 'code',
  catalogue: id,
  ...extra,
});
const money = (
  id: string,
  label: string,
  term?: string,
  kinds?: DocumentKind[],
): FieldDef => ({
  id,
  label,
  role: 'money',
  type: 'money',
  ...(term ? { term } : {}),
  ...(kinds ? { kinds } : {}),
});

const YEAR: FieldDef = {
  id: 'year',
  label: 'Fiscal year',
  role: 'dimension',
  type: 'year',
};
const KIND: FieldDef = {
  id: 'kind',
  label: 'Document',
  role: 'dimension',
  type: 'kind',
};
/** What a row IS (redesign W22): non-additive, like themes. */
const LABELS = [
  code('label', 'Label', { multi: true, derived: true }),
  code('subLabel', 'Sub-label', { multi: true, derived: true }),
];
const PLACE = [
  code('office', 'Office'),
  code('cluster', 'Cluster', { term: 'Cluster' }),
  code('sector', 'Sector'),
  code('finishLine', GOAL, { term: GOAL }),
  code('topic', 'Topic', { multi: true, derived: true }),
  ...LABELS,
];
/**
 * Where a row's money goes, read from its name at query time (specs/020 A3,
 * `barangay.ts`). Never stored; several barangays per row, so no total.
 */
const BARANGAY: FieldDef = {
  id: 'barangay',
  label: 'Barangay',
  role: 'dimension',
  type: 'code',
  multi: true,
  derived: true,
};
const CLASS_MONEY = [
  money('ps', 'Personnel Services', 'Personnel Services'),
  money(
    'mooe',
    'Maintenance and Other Operating Expenses',
    'Maintenance and Other Operating Expenses',
  ),
  money('fe', 'Financial Expenses', 'Financial Expenses'),
  money('co', 'Capital Outlay', 'Capital Outlay'),
];
const SPLITS: FieldDef[] = [
  {
    id: 'fund',
    label: 'Fund',
    role: 'dimension',
    type: 'split',
    catalogue: 'fund',
  },
  {
    id: 'expenseClass',
    label: 'Expense class',
    role: 'dimension',
    type: 'split',
    catalogue: 'expenseClass',
  },
];

export const SOURCES: Record<SourceId, SourceDef> = {
  'aip-programs': {
    id: 'aip-programs',
    label: 'AIP programs',
    grain: 'one program of a published Annual Investment Program',
    kinds: ['aip'],
    fields: [
      YEAR,
      ...PLACE,
      code('subFinishLine', `Sub-${GOAL.toLowerCase()}`),
      code('theme', 'Theme', { multi: true }),
      BARANGAY,
      ...SPLITS,
      { id: 'name', label: 'Program', role: 'dimension', type: 'text' },
      money('amount', 'Estimated cost', 'Estimated cost'),
      ...CLASS_MONEY,
    ],
  },
  'aip-activities': {
    id: 'aip-activities',
    label: 'AIP projects and activities',
    grain:
      'one lowest-level project or activity of a published AIP program (a program with none has no rows here)',
    kinds: ['aip'],
    fields: [
      YEAR,
      ...PLACE,
      code('subFinishLine', `Sub-${GOAL.toLowerCase()}`),
      code('theme', 'Theme', { multi: true }),
      BARANGAY,
      ...SPLITS,
      {
        id: 'paType',
        label: 'Project or activity',
        role: 'dimension',
        type: 'code',
      },
      { id: 'program', label: 'Program', role: 'dimension', type: 'text' },
      {
        id: 'name',
        label: 'Project or activity name',
        role: 'dimension',
        type: 'text',
        term: 'Program, project, activity',
      },
      money('amount', 'Estimated cost', 'Estimated cost'),
      ...CLASS_MONEY,
    ],
  },
  'climate-tags': {
    id: 'climate-tags',
    label: 'Climate change spending',
    grain:
      'one climate change tag (CCET) on a published AIP program or project/activity',
    kinds: ['aip'],
    fields: [
      YEAR,
      ...PLACE.filter((f) => !['topic', 'label', 'subLabel'].includes(f.id)),
      { id: 'level', label: 'Tagged on', role: 'dimension', type: 'code' },
      {
        id: 'ccetCode',
        label: 'CCET code',
        role: 'dimension',
        type: 'code',
        multi: true,
      },
      {
        id: 'ccet',
        label: 'CCET typology',
        role: 'dimension',
        type: 'text',
        multi: true,
      },
      {
        id: 'pillar',
        label: 'CCET pillar',
        role: 'dimension',
        type: 'code',
        multi: true,
      },
      { id: 'program', label: 'Program', role: 'dimension', type: 'text' },
      { id: 'name', label: 'Tagged row', role: 'dimension', type: 'text' },
      money('amount', 'Climate expenditure (adaptation + mitigation)'),
      money('cca', 'Climate change adaptation'),
      money('ccm', 'Climate change mitigation'),
    ],
  },
  'budget-ppas': {
    id: 'budget-ppas',
    label: 'Budget PPAs',
    grain: 'one top-level program, project or activity of a budget book',
    kinds: ['lep', 'ordinance'],
    fields: [
      YEAR,
      KIND,
      ...PLACE,
      code('subFinishLine', `Sub-${GOAL.toLowerCase()}`),
      code('theme', 'Theme', { multi: true }),
      BARANGAY,
      ...SPLITS,
      { id: 'name', label: 'PPA', role: 'dimension', type: 'text' },
      money('amount', 'Proposed budget / appropriation'),
      ...CLASS_MONEY,
    ],
  },
  'object-lines': {
    id: 'object-lines',
    label: 'Budget by account',
    grain: 'one account line (object of expenditure) of a budget book',
    kinds: ['lep', 'ordinance'],
    fields: [
      YEAR,
      KIND,
      code('office', 'Office'),
      code('cluster', 'Cluster'),
      code('expenseClass', 'Expense class'),
      code('fund', 'Fund'),
      ...LABELS,
      { id: 'account', label: 'Account', role: 'dimension', type: 'text' },
      money('amount', 'Budget year'),
      money('pastYear', 'Past year (actual)'),
      money('currentYear', 'Current year (estimate)'),
    ],
  },
  receipts: {
    id: 'receipts',
    label: 'Income',
    grain: 'one income line of a budget book (never added to spending)',
    kinds: ['lep', 'ordinance'],
    fields: [
      YEAR,
      KIND,
      {
        id: 'incomeClass',
        label: 'Income class',
        role: 'dimension',
        type: 'code',
      },
      {
        id: 'particulars',
        label: 'Source of income',
        role: 'dimension',
        type: 'text',
      },
      money('amount', 'Budget year'),
      money('pastYear', 'Past year (actual)'),
      money('currentYear', 'Current year (estimate)'),
    ],
  },
  'over-time': {
    id: 'over-time',
    label: 'Budget over time',
    grain:
      'one row of any budget document, each kind its own series, never added across kinds',
    kinds: ['aip', 'lep', 'ordinance'],
    fields: [
      YEAR,
      KIND,
      ...PLACE,
      ...SPLITS,
      money('amount', 'Amount'),
      ...CLASS_MONEY,
    ],
  },
  projects: {
    id: 'projects',
    label: 'Projects (procurement plans)',
    grain:
      "one published Project Procurement Management Plan, filed under its fiscal year's AIP",
    kinds: ['aip'],
    fields: [
      YEAR,
      code('office', 'Office'),
      code('cluster', 'Cluster', { term: 'Cluster' }),
      {
        id: 'classification',
        label: 'Classification',
        role: 'dimension',
        type: 'code',
      },
      {
        id: 'plan',
        label: 'Indicative or final',
        role: 'dimension',
        type: 'code',
      },
      ...SPLITS,
      ...LABELS,
      {
        id: 'name',
        label: 'Project',
        role: 'dimension',
        type: 'text',
        term: 'Project Procurement Management Plan',
      },
      {
        id: 'fundingProgram',
        label: 'Funding program (as the office wrote it)',
        role: 'dimension',
        type: 'text',
      },
      money('amount', 'Total cost'),
      ...CLASS_MONEY,
    ],
  },
  terms: {
    id: 'terms',
    label: 'Words in the budget',
    grain:
      "one distinctive word or two-word phrase of a program or PPA name, with that row's money (several per row, never added up)",
    kinds: ['aip', 'lep', 'ordinance'],
    fields: [
      YEAR,
      KIND,
      {
        id: 'term',
        label: 'Word',
        role: 'dimension',
        type: 'code',
        multi: true,
        derived: true,
      },
      {
        id: 'termLabel',
        label: 'Label the word is most typical of',
        role: 'dimension',
        type: 'code',
        catalogue: 'label',
        derived: true,
      },
      code('office', 'Office'),
      ...LABELS,
      { id: 'name', label: 'Program or PPA', role: 'dimension', type: 'text' },
      money('amount', 'Amount'),
    ],
  },
};

export const fieldOf = (source: SourceId, id: string) =>
  SOURCES[source].fields.find((f) => f.id === id);
