import type { PublicCycleRecord } from '@/lib/api';

/**
 * The two public budget sections.
 *
 * Which of them a year belongs to — the AIP, the Annual Budget, or both — is
 * decided by the API (`computeSections`, specs/012) and arrives as
 * `cycle.sections`. Nothing here re-derives it: a year joins Annual Budget when
 * its Ordinance is enacted, and keeps its AIP alongside.
 */
export type SectionKind = 'aip' | 'annual';

/**
 * Every public section that shares the masthead and tabs. The PPMP section is
 * not part of the AIP → Annual split: procurement plans exist for a year
 * whatever its status, so it offers every cycle.
 */
export type PublicSection = SectionKind | 'ppmp';

export const SECTION_LABEL: Record<PublicSection, string> = {
  aip: 'Annual Investment Program',
  annual: 'Annual Budget',
  ppmp: 'Project Procurement Management Plan',
};

/** Short form for nav, tabs and breadcrumbs. */
export const SECTION_SHORT: Record<PublicSection, string> = {
  aip: 'AIP',
  annual: 'Annual Budget',
  ppmp: 'PPMP',
};

/** The budget sections this year belongs to (from the API). */
export function sectionsOf(cycle: PublicCycleRecord): SectionKind[] {
  return cycle.sections;
}

/**
 * The one section to point at when a page needs a single budget link for the
 * year (PPMP pages, the `/budget` year picker): the enacted budget once there
 * is one, else the AIP.
 */
export function primarySection(cycle: PublicCycleRecord): SectionKind {
  return cycle.sections.includes('annual') ? 'annual' : 'aip';
}

export function cyclesIn(
  cycles: PublicCycleRecord[],
  kind: PublicSection,
): PublicCycleRecord[] {
  return cycles
    .filter((c) => kind === 'ppmp' || sectionsOf(c).includes(kind))
    .sort((a, b) => b.fiscalYear - a.fiscalYear);
}

/**
 * The year a bare `/aip` or `/annual` should land on — the most recent one the
 * section has. Null when the section is empty, which the route turns into a 404
 * rather than an empty page.
 */
export function newestYearIn(
  cycles: PublicCycleRecord[],
  kind: PublicSection,
): number | null {
  return cyclesIn(cycles, kind)[0]?.fiscalYear ?? null;
}

/**
 * Resolve a `[year]` path segment against the section's cycles.
 *
 * Rejects a year that exists but is not in this section, so `/aip/2026` does
 * not quietly render the enacted budget under the wrong heading — it 404s, and
 * `/annual/2026` is the URL that works. A year in both sections resolves in both.
 */
export function resolveCycle(
  cycles: PublicCycleRecord[],
  kind: PublicSection,
  yearParam: string,
): PublicCycleRecord | null {
  const year = Number(yearParam);
  if (!Number.isInteger(year)) return null;
  return cyclesIn(cycles, kind).find((c) => c.fiscalYear === year) ?? null;
}

export const SECTION_TABS = ['overview', 'browse', 'receipts', 'spending', 'methodology'] as const;
export type SectionTab = (typeof SECTION_TABS)[number];

/**
 * What a row's peso figure is, by document. An AIP is a plan — a wishlist of
 * programs with their estimated cost; the proposed budget is the LEP the Mayor
 * submits, and only the enacted ordinance appropriates. Never call an AIP
 * amount a budget.
 */
export const AMOUNT_LABEL: Record<SectionKind, string> = {
  aip: 'Estimated Cost',
  annual: 'Appropriation',
};

/**
 * A historical year the city posts only as the Mayor's proposal (FY2023–2025)
 * shows that LEP in the Annual section (specs/017 FR-002). Its figures were
 * proposed, never appropriated.
 */
export const LEP_AMOUNT_LABEL = 'Proposed Budget';

/** Whether a year's Annual section is serving its LEP rather than an enacted Ordinance. */
export const isLepYear = (cycle: Pick<PublicCycleRecord, 'annualDocumentKind'>) =>
  cycle.annualDocumentKind === 'LEP';

/** The label for a year's amounts in a section (default: its `primarySection`). */
export function amountLabelOf(cycle: PublicCycleRecord, section?: SectionKind): string {
  const kind = section ?? primarySection(cycle);
  return kind === 'annual' && isLepYear(cycle) ? LEP_AMOUNT_LABEL : AMOUNT_LABEL[kind];
}

/** The label for a year's amounts, from its place in the sections (`primarySection`). */
export function amountLabelFor(cycles: PublicCycleRecord[], fiscalYear: number): string {
  const cycle = cycles.find((c) => c.fiscalYear === fiscalYear);
  return cycle ? amountLabelOf(cycle) : AMOUNT_LABEL.aip;
}

export const TAB_LABEL: Record<SectionTab, string> = {
  overview: 'Overview',
  browse: 'Browse',
  receipts: 'Income',
  spending: 'Spending',
  methodology: 'Methodology',
};

export function sectionHref(
  kind: PublicSection,
  year: number,
  tab: SectionTab = 'overview',
): string {
  return `/${kind}/${year}/${tab}`;
}

/**
 * Whether this year's Overview tab is shown in a section — a per-year switch in
 * the control panel (`AIPCycle.public{Aip,Annual,Ppmp}OverviewEnabled`). Off,
 * the tab is hidden and the Overview URL redirects to Browse.
 */
export function overviewEnabled(
  cycle: PublicCycleRecord,
  kind: PublicSection,
): boolean {
  if (kind === 'aip') return cycle.publicAipOverviewEnabled;
  if (kind === 'annual') return cycle.publicAnnualOverviewEnabled;
  return cycle.publicPpmpOverviewEnabled;
}

/**
 * Whether the Methodology pages are public. Hidden for now (2026-10-26): the
 * tab, the hand-off card and the outline link go, the sitemap drops them, and
 * the URLs redirect to Browse.
 */
// ponytail: one site-wide switch; make it per cycle like the Overview if a year ever needs its own.
export const METHODOLOGY_PUBLIC = false;

/** The tabs a section shows for this year, in order. */
export function tabsFor(
  cycle: PublicCycleRecord,
  kind: PublicSection,
): SectionTab[] {
  // ponytail: the Annual Overview's copy says the budget is law ("This one is
  // law", "Enacted amount by …"), which an LEP year's is not, so an LEP year
  // shows Browse only. Give the Overview LEP copy to bring it back.
  const lepAnnual = kind === 'annual' && isLepYear(cycle);
  // The rest of an Annual book (specs/017) shows only where the year has it.
  const book = kind === 'annual' ? cycle.annualBook : undefined;
  return SECTION_TABS.filter(
    (t) =>
      (t !== 'overview' || (!lepAnnual && overviewEnabled(cycle, kind))) &&
      (t !== 'receipts' || !!book?.receipts) &&
      (t !== 'spending' || !!book?.objects) &&
      (t !== 'methodology' || METHODOLOGY_PUBLIC),
  );
}

/** Where a bare `/aip/<year>`-style visit lands: the first tab it shows. */
export function landingHref(cycle: PublicCycleRecord, kind: PublicSection): string {
  return sectionHref(kind, cycle.fiscalYear, tabsFor(cycle, kind)[0]);
}
