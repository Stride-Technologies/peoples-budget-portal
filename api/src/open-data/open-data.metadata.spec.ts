import {
  ACTIVITY_COLUMNS,
  CLIMATE_COLUMNS,
  FUND_COLUMNS,
  PROGRAM_COLUMNS,
  PROJECT_COLUMNS,
} from './open-data.mapper.js';
import {
  OPEN_DATA_LICENCE_CONFIRMED,
  buildMetadata,
  documentOf,
} from './open-data.metadata.js';

const counts = { programs: 2, activities: 6, projects: 1 };
const asOf = new Date('2026-10-14T11:30:00Z');

describe('buildMetadata', () => {
  const md = buildMetadata({ fiscalYear: 2027 }, 'AIP', asOf, counts);

  it('documents every column of every file', () => {
    for (const cols of [
      PROGRAM_COLUMNS,
      ACTIVITY_COLUMNS,
      FUND_COLUMNS,
      CLIMATE_COLUMNS,
      PROJECT_COLUMNS,
    ]) {
      for (const c of cols) {
        expect(md).toContain(`\`${c.csvName}\``);
        expect(md).toContain(`\`${c.name}\``);
      }
    }
  });

  it('names the document it describes', () => {
    expect(md).toContain('Annual Investment Program');
    const enacted = buildMetadata(
      { fiscalYear: 2026 },
      'ANNUAL_BUDGET',
      asOf,
      counts,
    );
    expect(enacted).toContain('Annual Budget');
    expect(enacted).not.toContain('Annual Investment Program');
  });

  // CRITICAL (specs/012): adopting an AIP must not relabel it as the enacted
  // budget; only the historical FY2026 record reads as one until P8.
  it('keeps an adopted AIP labelled as the AIP', () => {
    expect(documentOf({ fiscalYear: 2027, status: 'ADOPTED' })).toBe('AIP');
    expect(documentOf({ fiscalYear: 2026, status: 'ADOPTED' })).toBe(
      'ANNUAL_BUDGET',
    );
    expect(documentOf({ fiscalYear: 2026, status: 'LOCKED' })).toBe(
      'ANNUAL_BUDGET',
    );
    expect(documentOf({ fiscalYear: 2027, status: 'OPEN' })).toBe('AIP');
  });

  it('says the reuse terms are pending while the licence is unconfirmed', () => {
    expect(OPEN_DATA_LICENCE_CONFIRMED).toBe(false);
    expect(md).toContain(
      'Reuse terms are pending confirmation by the City of Sample',
    );
    expect(md).not.toContain('CC BY 4.0');
  });

  it('states the data date and the file list', () => {
    expect(md).toContain('2026-10-14T11:30:00.000Z');
    for (const f of [
      'programs.csv',
      'project-activities.csv',
      'funds.csv',
      'climate-tags.csv',
      'projects.csv',
      'sample-budget-2027.json',
    ]) {
      expect(md).toContain(f);
    }
  });
});
