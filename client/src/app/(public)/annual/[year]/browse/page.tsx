import { toListItems } from '@/lib/public-registry-list';
import { ExploreThis } from '@/components/explore/explore-this';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { PublicRegistryClient } from '@/components/public/public-registry-client';
import { loadSectionCycle } from '@/lib/public-section-page';
import {
  apiPublicGetClusters,
  apiPublicGetFinishLines,
  apiGetPublicThematicTags,
  apiPublicGetRegistry,
} from '@/lib/api';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props { params: Promise<{ year: string }> }

const DESCRIPTION = "Search and filter every programme, project and activity in {placeName}'s enacted Annual Budget.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const description = DESCRIPTION.replace('{placeName}', brand.placeName);
  const title = `Browse | Annual Budget ${year} | ${brand.placeName}`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/annual/${year}/browse`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/**
 * The whole cycle in one request. Grouping by office is only correct over the
 * complete result set, so there is no page to fetch — same ceiling as `/budget`
 * and the API's own.
 */
const REGISTRY_FETCH_LIMIT = 1000;

export default async function BrowsePage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('annual', year, 'browse');

  const [registry, finishLines, clusters, thematicTags] = await Promise.all([
    apiPublicGetRegistry({ cycleId: cycle.id, limit: REGISTRY_FETCH_LIMIT, section: 'annual' }),
    apiPublicGetFinishLines(cycle.id, 'annual'),
    apiPublicGetClusters(),
    apiGetPublicThematicTags(),
  ]);

  return (
    <>
      <SectionChrome kind="annual" cycle={cycle} years={years} tab="browse" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ExploreThis document="ordinance" year={cycle.fiscalYear} by="office" />
        <Suspense>
          {/* The same table as /budget, with the year pinned by the route.
              Deliberately not restyled: it is a reference tool, and editorial
              type would fight the density that makes it usable. */}
          <PublicRegistryClient
            embedded
            section="annual"
            cycles={[cycle]}
            clusters={clusters}
            finishLines={finishLines}
            thematicTags={thematicTags}
            initialCycleId={cycle.id}
            initialItems={toListItems(registry.items, false)}
            initialTotal={registry.total}
            initialTotalBudget={registry.totalBudget}
            initialTotalProposedBudget={registry.totalProposedBudget}
            initialSubmittedOfficeCount={registry.submittedOfficeCount}
            initialTotalOfficeCount={registry.totalOfficeCount}
          />
        </Suspense>
      </div>
    </>
  );
}
