import type { MetadataRoute } from 'next';
import { apiPublicGetCycles, apiPublicGetRegistry } from '@/lib/api';
import { sectionsOf, tabsFor, type PublicSection } from '@/lib/public-sections';
import { SITE_URL, STATIC_PAGE_LAST_MODIFIED } from '@/lib/seo';

const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`,               lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'weekly',  priority: 1.0 },
  { url: `${SITE_URL}/budget`,            lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'weekly',  priority: 0.9 },
  { url: `${SITE_URL}/learn`,          lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.8 },
  { url: `${SITE_URL}/learn/aip-vs-annual-budget`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${SITE_URL}/learn/reading-an-entry`,     lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${SITE_URL}/learn/glossary`,             lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${SITE_URL}/developers/open-data`,   lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/developers/source-code`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.4 },
  { url: `${SITE_URL}/license`,        lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/privacy-policy`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/terms`,          lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const cycles = await apiPublicGetCycles();

    // Every year's section pages: /aip/<year>/… and /annual/<year>/… for each
    // section the API puts the year in (both, once an AIP year is enacted), and
    // /ppmp/<year>/… for every year. An Overview switched off is left out.
    const sectionEntries: MetadataRoute.Sitemap = cycles.flatMap((c) =>
      ([...sectionsOf(c), 'ppmp'] as PublicSection[]).flatMap((kind) =>
      tabsFor(c, kind).map((page) => ({
        url: `${SITE_URL}/${kind}/${c.fiscalYear}/${page}`,
        lastModified: STATIC_PAGE_LAST_MODIFIED,
        changeFrequency: page === 'methodology' ? 'monthly' : 'weekly',
        priority: (page === 'overview' ? 0.9 : page === 'browse' ? 0.8 : 0.5) - (kind === 'ppmp' ? 0.2 : 0),
      })),
      ),
    );

    const cycle =
      cycles.find((c) => c.status === 'OPEN') ??
      cycles.find((c) => c.status === 'PLANNING') ??
      cycles[0];
    if (!cycle) return [...STATIC_PAGES, ...sectionEntries];

    // Single fetch with a generous limit — city AIP programs are bounded in scope.
    // The registry endpoint returns projectActivities inline, so one call covers all PA URLs.
    const registry = await apiPublicGetRegistry({
      cycleId: cycle.id,
      limit: 2000,
    });

    const programEntries: MetadataRoute.Sitemap = [];
    for (const program of registry.items) {
      const lastMod = program.lastUpdatedAt ? new Date(program.lastUpdatedAt) : new Date();
      programEntries.push({
        url: `${SITE_URL}/budget/${program.id}`,
        lastModified: lastMod,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
      for (const pa of program.projectActivities) {
        programEntries.push({
          url: `${SITE_URL}/budget/${program.id}/${pa.id}`,
          lastModified: lastMod,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }

    return [...STATIC_PAGES, ...sectionEntries, ...programEntries];
  } catch {
    // API unreachable (build time or outage) — return static pages so the sitemap
    // never errors out and at minimum covers the shell structure.
    return STATIC_PAGES;
  }
}
