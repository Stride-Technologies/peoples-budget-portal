import type { AIPCycleStatus } from '../generated/prisma/index';
import { computeSections } from '../budget-cycles/cycle-sections.js';
import {
  ACTIVITY_COLUMNS,
  CLIMATE_COLUMNS,
  FUND_COLUMNS,
  PROGRAM_COLUMNS,
  PROJECT_COLUMNS,
  type Column,
} from './open-data.mapper.js';
import { getBrand, type Brand } from '../common/brand.js';

/**
 * Flip to `true` when the City adopts CC BY 4.0, in the same change as the
 * `/open-data-policy` page's unconfirmed copy. Until then the bundle says the
 * terms are pending, which is true, and the data is downloadable either way.
 */
export const OPEN_DATA_LICENCE_CONFIRMED = false as boolean;

const licenceConfirmed = ({ government, siteHost }: Brand) =>
  'Creative Commons Attribution 4.0 International (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/. ' +
  `Credit it as: "Source: ${government}, People's Budget Portal (${siteHost})".`;
const licencePending = ({ lguName, siteUrl }: Brand) =>
  `Reuse terms are pending confirmation by the ${lguName}. See ${siteUrl}/open-data-policy.`;

/** A year's bundle and its nested JSON are named for the LGU: `san-isidro-budget-2027`. */
export const bundleName = (year: number): string =>
  `${getBrand().slug}-budget-${year}`;

/**
 * Which document a year's open data holds. The year's dataset is the AIP while
 * the year has one, and the enacted budget only for a year that is in the
 * Annual Budget section alone (specs/012 contracts/open-data.md) — the same
 * rule as the public site, via `computeSections`. Open data serves published
 * programs only, so the year is assumed to have some.
 */
export const documentOf = (cycle: { fiscalYear: number; status: string }) => {
  const sections = computeSections({
    fiscalYear: cycle.fiscalYear,
    aipStatus: cycle.status as AIPCycleStatus,
    hasPublicAip: true,
    hasEnactedOrdinance: false,
  });
  return sections.includes('annual') && !sections.includes('aip')
    ? 'ANNUAL_BUDGET'
    : 'AIP';
};

export const licenceLine = () =>
  (OPEN_DATA_LICENCE_CONFIRMED ? licenceConfirmed : licencePending)(getBrand());

export const bundleFiles = (year: number) => [
  'programs.csv',
  'project-activities.csv',
  'funds.csv',
  'climate-tags.csv',
  'projects.csv',
  `${bundleName(year)}.json`,
  'METADATA.md',
];

function dictionary(file: string, intro: string, cols: readonly Column[]) {
  return [
    `### ${file}`,
    '',
    intro,
    '',
    '| CSV column | JSON key | Meaning |',
    '|---|---|---|',
    ...cols.map(
      (c) =>
        `| \`${c.csvName}\` | \`${c.name}\` | ${c.description.replace(/\|/g, '\\|')} |`,
    ),
    '',
  ].join('\n');
}

/**
 * The bundle's README. The data dictionary is generated from the column
 * definitions the mapper uses, so it lists exactly what the files hold.
 */
export function buildMetadata(
  cycle: { fiscalYear: number },
  document: 'AIP' | 'ANNUAL_BUDGET',
  dataAsOf: Date,
  counts: { programs: number; activities: number; projects: number },
): string {
  const year = cycle.fiscalYear;
  const annual = document === 'ANNUAL_BUDGET';
  const doc = annual ? 'Annual Budget' : 'Annual Investment Program';
  const { placeName, lguName, council, siteUrl, siteHost } = getBrand();
  return [
    `# ${placeName} ${year} ${doc}: open data`,
    '',
    `The ${year} ${doc} of the ${lguName} as published on the People's Budget Portal`,
    `(${siteUrl}). It holds exactly what the public site shows: the published`,
    'version of every program, with its projects and activities, fund sources and climate',
    'tags, and the published procurement projects. No drafts, no feedback, no personal data.',
    '',
    `- **Document:** ${doc}`,
    `- **Data as of:** ${dataAsOf.toISOString()} (the newest publish included)`,
    `- **Rows:** ${counts.programs} programs, ${counts.activities} projects and activities, ${counts.projects} procurement projects`,
    `- **Licence:** ${licenceLine()}`,
    annual
      ? `- **Source:** the Annual Budget as enacted by the ${council}, as shown on ${siteHost}`
      : `- **Source:** the entries published by the LGU's offices on ${siteHost}`,
    '',
    '## Files',
    '',
    ...bundleFiles(year).map((f) => `- \`${f}\``),
    '',
    'CSV files are UTF-8 with a byte-order mark, comma-separated, quoted per RFC 4180.',
    'Money is in pesos, written as text with two decimals (`32235000.00`), with no ₱ or',
    'thousands separators. Empty means not stated.',
    '',
    '## How the tables join',
    '',
    '- `project-activities.csv` `program_id` → `programs.csv` `id`; `parent_activity_id` →',
    '  its own `id` (empty for a top-level row). Projects nest activities.',
    '- `funds.csv` and `climate-tags.csv`: `row_type` + `row_id` → a program or an activity.',
    "- A program's `proposed_total` is its figure. Do not add its activities on top: for a",
    '  program with activities it already equals their sum, and a `DIRECT_COSTS` program has none.',
    '- Join on `id`, not on `aip_code`: a tentative code changes when an office reorders.',
    `- \`${bundleName(year)}.json\` holds the same rows nested (program → activities → funds,`,
    '  climate tag), with camelCase keys.',
    '',
    '## Data dictionary',
    '',
    dictionary(
      'programs.csv',
      'One row per published program.',
      PROGRAM_COLUMNS,
    ),
    dictionary(
      'project-activities.csv',
      'One row per project or activity of a published program.',
      ACTIVITY_COLUMNS,
    ),
    dictionary(
      'funds.csv',
      'One row per fund source of every program and activity.',
      FUND_COLUMNS,
    ),
    dictionary(
      'climate-tags.csv',
      'One row per climate tag × CCET code; a tag with no code yet gives one row with empty code columns.',
      CLIMATE_COLUMNS,
    ),
    dictionary(
      'projects.csv',
      'One row per published procurement project (PPMP).',
      PROJECT_COLUMNS,
    ),
  ].join('\n');
}
