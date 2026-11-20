import { AIP_SECTIONS, type PapClass } from './schemas.ts';
import { addDecimalStrings } from './currency-formatter.ts';

/**
 * Groups the registry the way the city reads its AIP: by implementing office,
 * then by the three appropriation sections inside each office.
 *
 * This mirrors what `AIPRegistryExportService` does to build the workbook — one
 * sheet per office, `I. GENERAL ADMINISTRATIVE SERVICES` / `II. SUPPORT TO
 * OPERATIONS` / `III. OPERATIONS` inside — so the screen and the export agree.
 *
 * Pure and dependency-free on purpose: the alternative was doing this inline in
 * a 1,500-line component, where none of it could be tested without a DOM.
 *
 * **Relies on the server's ordering.** `AIPRegistryService.list` orders by
 * `office.acronym → papClass → orderIndex`, so offices are already contiguous
 * and in the right sequence; this walks that order rather than imposing its own.
 * Offices appear in first-appearance order for exactly that reason — sorting here
 * would silently mask a server-side ordering change instead of surfacing it.
 */

/** The minimum an entry needs for grouping. Structurally satisfied by `AIPEntry`. */
export interface GroupableEntry {
  id: string;
  papClass?: PapClass | null;
  office_id?: string | null;
  office_name?: string | null;
  office_acronym?: string | null;
  /**
   * Set on a component program — the office whose printed AB sheet it appears
   * under. When present it decides the group, not `office_id`.
   */
  host_office_id?: string | null;
  host_office_name?: string | null;
  host_office_acronym?: string | null;
  total_amount: string;
}

export interface OfficeSection<T> {
  /**
   * Null on the COMPONENT PROGRAMS band, which is not one of the three
   * appropriation sections — it collects programs belonging to other offices.
   */
  papClass: PapClass | null;
  label: string;
  programs: T[];
}

/**
 * The band the city prints below an office's own three sections, holding
 * programs that belong to another office but are budgeted here.
 */
export const COMPONENT_PROGRAMS_LABEL = 'COMPONENT PROGRAMS';

export interface OfficeGroup<T> {
  /** Null for programs with no implementing office; that group sorts last. */
  officeId: string | null;
  /**
   * Both forms, because they are needed in different places. Twelve of the
   * city's offices are named "Office of the City …", so a truncated full name
   * identifies nothing — the acronym leads wherever space is tight, and the full
   * name comes along for the places that have room for it.
   */
  officeAcronym: string;
  officeName: string;
  programCount: number;
  /** Exact decimal string, summed in centavos — never a float. */
  total: string;
  /** Only the sections that actually hold programs, in printed order. */
  sections: OfficeSection<T>[];
}

/** The key an office group is expanded/collapsed under. */
export const UNASSIGNED_OFFICE_KEY = '__unassigned_office__';

export function officeGroupKey(officeId: string | null): string {
  return officeId ?? UNASSIGNED_OFFICE_KEY;
}

/**
 * Every id under an office that can be expanded — its programs, and any
 * project holding activities of its own.
 *
 * Opening an office shows its whole tree rather than another row of collapsed
 * chevrons: an office is the unit someone reviews, and making them click through
 * three levels to see the PPAs they came for is the same friction the old
 * pagination created.
 */
export function expandableKeysIn<T extends GroupableEntry & { children?: T[] }>(
  group: OfficeGroup<T>,
): string[] {
  const keys: string[] = [officeGroupKey(group.officeId)];

  const walk = (rows: T[]) => {
    for (const row of rows) {
      if (row.children && row.children.length > 0) {
        keys.push(row.id);
        walk(row.children);
      }
    }
  };

  for (const section of group.sections) walk(section.programs);
  return keys;
}

/**
 * @param amountOf Which figure an office's subtotal sums. Defaults to
 *   `total_amount`, which is the **Total** column the staff registry shows. The
 *   public table shows **Proposed** instead, and `grandTotal` is 0 there while
 *   line items are hidden — so a header summing `total_amount` would print
 *   `TOTAL 0.000` above rows showing real money. A header has to sum the column
 *   underneath it, so the caller that changes the column changes this too.
 */
export function groupByOffice<T extends GroupableEntry>(
  entries: T[],
  amountOf: (entry: T) => string = (entry) => entry.total_amount,
): OfficeGroup<T>[] {
  // Insertion-ordered, so offices keep the server's acronym ordering.
  const byOffice = new Map<
    string,
    { name: string; acronym: string; id: string | null; rows: T[] }
  >();

  for (const entry of entries) {
    // A component program is grouped by its *host*: that is the sheet it prints
    // in. It keeps its own office everywhere else, including its AIP code.
    const groupOfficeId = entry.host_office_id ?? entry.office_id ?? null;
    const key = officeGroupKey(groupOfficeId);
    const existing = byOffice.get(key);
    if (existing) {
      existing.rows.push(entry);
    } else {
      byOffice.set(key, {
        id: groupOfficeId,
        // A program always carries both; the fallbacks are for the unassigned
        // group and for defensive safety, not expected paths. The acronym falls
        // back to the full name rather than to a placeholder — a long label
        // beats an anonymous one.
        name:
          entry.host_office_name ?? entry.office_name ?? 'No implementing office',
        acronym:
          entry.host_office_acronym ??
          entry.host_office_name ??
          entry.office_acronym ??
          entry.office_name ??
          'No implementing office',
        rows: [entry],
      });
    }
  }

  const groups: OfficeGroup<T>[] = [];

  for (const office of byOffice.values()) {
    const sections: OfficeSection<T>[] = [];

    // An office's own programs fill the three appropriation sections; everything
    // hosted here belongs to another office and prints in its own band below,
    // the way the city's book lays it out.
    const ownRows = office.rows.filter((row) => !row.host_office_id);
    const componentRows = office.rows.filter((row) => !!row.host_office_id);

    for (const section of AIP_SECTIONS) {
      // Programs with no papClass print under Operations, matching both the
      // export's BASIC_SECTIONS and the AIP form itself. No fourth bucket.
      const programs = ownRows.filter(
        (row) => (row.papClass ?? 'OPERATIONS') === section.papClass,
      );
      // An empty section is omitted here, unlike the export — the workbook keeps
      // a blank row so the printed form still shows all three headings, but on
      // screen an empty heading is just noise to scroll past.
      if (programs.length > 0) {
        sections.push({
          papClass: section.papClass,
          label: section.label,
          programs,
        });
      }
    }

    if (componentRows.length > 0) {
      sections.push({
        papClass: null,
        label: COMPONENT_PROGRAMS_LABEL,
        programs: componentRows,
      });
    }

    groups.push({
      officeId: office.id,
      officeAcronym: office.acronym,
      officeName: office.name,
      programCount: office.rows.length,
      total: addDecimalStrings(office.rows.map(amountOf)),
      sections,
    });
  }

  // Programs with no office go last, so a data gap never leads the list. They are
  // kept rather than dropped (the export drops them): the registry's footer total
  // counts them, so hiding them would make the sections stop adding up.
  return [
    ...groups.filter((group) => group.officeId !== null),
    ...groups.filter((group) => group.officeId === null),
  ];
}

/**
 * Office keys whose group contains at least one entry matching `predicate`.
 *
 * Used to auto-expand offices with search hits: a collapsed list of 53 offices
 * is the right default, but it is the wrong answer to a search.
 */
export function officeKeysMatching<T extends GroupableEntry>(
  groups: OfficeGroup<T>[],
  predicate: (entry: T) => boolean,
): string[] {
  return groups
    .filter((group) =>
      group.sections.some((section) => section.programs.some(predicate)),
    )
    .map((group) => officeGroupKey(group.officeId));
}
