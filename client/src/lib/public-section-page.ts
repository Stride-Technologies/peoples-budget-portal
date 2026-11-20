import { notFound } from 'next/navigation';
import { localeRedirect } from '@/i18n/server';
import { apiPublicGetCycles, type PublicCycleRecord } from '@/lib/api';
import {
  cyclesIn,
  landingHref,
  tabsFor,
  resolveCycle,
  sectionHref,
  type PublicSection,
  type SectionTab,
} from '@/lib/public-sections';

/**
 * Everything a section page needs from the `[year]` segment: the cycle it names,
 * and the sibling years the selector should offer.
 *
 * 404s rather than rendering an empty shell when the year is not a year, or is a
 * year that belongs to the other section — `/aip/2026` is wrong, not empty, and
 * `/annual/2026` is the URL that works. A tab the year does not show (an
 * Overview switched off, Methodology while it is hidden) redirects to Browse
 * rather than 404ing: the link was right, the page is withheld.
 */
export async function loadSectionCycle(
  kind: PublicSection,
  yearParam: string,
  tab?: SectionTab,
): Promise<{ cycle: PublicCycleRecord; years: number[]; cycles: PublicCycleRecord[] }> {
  const cycles = await apiPublicGetCycles();
  const cycle = resolveCycle(cycles, kind, yearParam);
  if (!cycle) notFound();
  if (tab && !tabsFor(cycle, kind).includes(tab)) {
    await localeRedirect(sectionHref(kind, cycle.fiscalYear, 'browse'));
  }
  return {
    cycle,
    years: cyclesIn(cycles, kind).map((c) => c.fiscalYear),
    cycles,
  };
}

/**
 * `/aip/<year>` and its siblings: the named year on its first visible tab. 404 when the
 * section has no such year.
 */
export async function redirectToSection(
  kind: PublicSection,
  yearParam: string,
): Promise<never> {
  const cycle = resolveCycle(await apiPublicGetCycles(), kind, yearParam);
  if (!cycle) notFound();
  return localeRedirect(landingHref(cycle, kind));
}

/**
 * `/aip`, `/annual`, `/ppmp`: the section's newest year on its first visible tab. Returns
 * (does not redirect) when the section has no year yet: a new LGU has no enacted budget on its
 * first day, and the nav still links here, so the page says so instead of answering 404.
 */
export async function redirectToNewest(kind: PublicSection): Promise<void> {
  const cycle = cyclesIn(await apiPublicGetCycles(), kind)[0];
  if (cycle) await localeRedirect(landingHref(cycle, kind));
}
