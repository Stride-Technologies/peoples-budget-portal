import { toListItems } from '@/lib/public-registry-list';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicRegistryClient } from '@/components/public/public-registry-client';
import { loadPublicCycles, loadPublicClusters, loadPublicFinishLines, loadPublicThematicTags, loadPublicRegistry } from './_actions';
import { canonical, OG_IMAGES, SITE_URL } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

const REGISTRY_URL = canonical('/budget');

const registryDescription = (placeName: string) =>
  `Browse ${placeName}'s Annual Budget Registry. Search and filter programs, projects, activities, and budget allocations across all offices: the enacted Annual Budget and the Annual Investment Program still being prepared.`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const title = `Annual Budget Registry | ${brand.siteName}`;
  const description = registryDescription(brand.placeName);
  return {
    title,
    description,
    alternates: { canonical: REGISTRY_URL },
    openGraph: { images: OG_IMAGES, type: "website", title, description, url: REGISTRY_URL },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * The whole cycle in one request. The table groups by office and grouping is only
 * correct over the complete result set, so there is no page to fetch. Mirrors
 * `REGISTRY_FETCH_LIMIT` in the staff registry and the API's own ceiling.
 */
const REGISTRY_FETCH_LIMIT = 1000;

export default async function PublicRegistryPage() {
  // Clusters do not depend on the cycle, so they belong in the first tier rather
  // than waiting behind it — this was three sequential round-trips, now two.
  const [cyclesResult, clustersResult] = await Promise.all([
    loadPublicCycles(),
    loadPublicClusters(),
  ]);

  const cycles = Array.isArray(cyclesResult) ? cyclesResult : [];
  const clusters = Array.isArray(clustersResult) ? clustersResult : [];
  const openCycle = cycles.find((c) => c.status === 'OPEN') ?? cycles[0];

  // Both need the cycle, so they share the second tier; the tag catalog does
  // not, but there is no earlier tier left to put it in.
  const [finishLinesResult, registryResult, thematicTagsResult] = await Promise.all([
    loadPublicFinishLines(openCycle?.id),
    openCycle
      ? loadPublicRegistry({ cycleId: openCycle.id, limit: REGISTRY_FETCH_LIMIT })
      : null,
    loadPublicThematicTags(),
  ]);

  const finishLines = Array.isArray(finishLinesResult) ? finishLinesResult : [];
  const thematicTags = Array.isArray(thematicTagsResult) ? thematicTagsResult : [];

  const initialItems = registryResult && 'items' in registryResult ? registryResult.items : [];
  const initialTotal = registryResult && 'total' in registryResult ? registryResult.total : 0;
  const initialTotalBudget = registryResult && 'totalBudget' in registryResult ? registryResult.totalBudget : '0.00';
  const initialTotalProposedBudget = registryResult && 'totalProposedBudget' in registryResult ? registryResult.totalProposedBudget : '0.00';
  const initialSubmittedOfficeCount = registryResult && 'submittedOfficeCount' in registryResult ? registryResult.submittedOfficeCount : 0;
  const initialTotalOfficeCount = registryResult && 'totalOfficeCount' in registryResult ? registryResult.totalOfficeCount : 0;

  const brand = await getBrand();
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${brand.placeName} Annual Budget Registry`,
    description: `Every program, project and activity in ${brand.placeName}'s annual budget (the enacted Annual Budget and the Annual Investment Program under preparation), with allocations by expense class (PS/MOOE/FE/CO), implementing office and development priority.`,
    url: REGISTRY_URL,
    publisher: { "@type": "GovernmentOrganization", "@id": `${SITE_URL}/#organization`, name: brand.government },
    isAccessibleForFree: true,
    inLanguage: "en-PH",
    spatialCoverage: { "@type": "AdministrativeArea", name: [brand.placeName, brand.province, "Philippines"].filter(Boolean).join(", ") },
    keywords: ["Annual Budget", "AIP", "Annual Investment Program", brand.placeName, "government budget", "public spending"],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <Suspense>
        <PublicRegistryClient
          cycles={cycles}
          clusters={clusters}
          finishLines={finishLines}
          thematicTags={thematicTags}
          initialCycleId={openCycle?.id}
          initialItems={toListItems(initialItems, false)}
          initialTotal={initialTotal}
          initialTotalBudget={initialTotalBudget}
          initialTotalProposedBudget={initialTotalProposedBudget}
          initialSubmittedOfficeCount={initialSubmittedOfficeCount}
          initialTotalOfficeCount={initialTotalOfficeCount}
        />
      </Suspense>
    </>
  );
}
