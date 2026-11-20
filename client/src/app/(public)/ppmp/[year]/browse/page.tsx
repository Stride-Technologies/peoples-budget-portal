import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import PublicPpmpList from '@/components/public/public-ppmp-list';
import { loadSectionCycle } from '@/lib/public-section-page';
import {
  apiPublicGetClusters,
  apiPublicGetFinishLines,
  apiPublicGetPpmpList,
  apiPublicGetRegistry,
} from '@/lib/api';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props { params: Promise<{ year: string }> }

const DESCRIPTION =
  'Search every published Project Procurement Management Plan for the year: what each office plans to buy, and its line items.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const title = `Browse | Project Procurement Management Plan ${year} | ${(await getBrand()).placeName}`;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: canonical(`/ppmp/${year}/browse`) },
    openGraph: { images: OG_IMAGES, title, description: DESCRIPTION },
  };
}

export default async function PpmpBrowsePage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('ppmp', year, 'browse');
  const [ppmps, clusters, finishLines, registry] = await Promise.all([
    apiPublicGetPpmpList(cycle.id).catch(() => []),
    apiPublicGetClusters(),
    apiPublicGetFinishLines(cycle.id),
    // One row is enough: only the office count is read.
    apiPublicGetRegistry({ cycleId: cycle.id, limit: 1 }),
  ]);

  return (
    <>
      <SectionChrome kind="ppmp" cycle={cycle} years={years} tab="browse" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* useSearchParams (the ?ppmp= drawer) needs a Suspense boundary. */}
        <Suspense>
          <PublicPpmpList
            initialPpmps={ppmps}
            clusters={clusters}
            finishLines={finishLines}
            totalOfficeCount={registry.totalOfficeCount}
          />
        </Suspense>
      </div>
    </>
  );
}
