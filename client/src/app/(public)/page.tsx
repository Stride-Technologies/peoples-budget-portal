import type { Metadata } from 'next';
import { LandingPage } from '@/components/public/landing-page';
import { OG_IMAGES, SITE_URL, jsonLdHtml } from '@/lib/seo';
import { localeAlternates } from '@/i18n/server';
import { compactPeso } from '@/lib/currency-formatter';
import { cyclesIn } from '@/lib/public-sections';
import {
  loadPublicCycles,
  loadPublicClusters,
  loadPublicFinishLines,
  loadPublicRegistry,
} from './budget/_actions';
import { liveBudgets } from '@/lib/budget-cycle';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: `People's Budget Portal | ${brand.government}`,
    description: `Buwis natin. Boto natin. Budget natin. ${brand.placeName}'s public portal for the Annual Investment Program: view programs, project activities, and leave feedback.`,
    openGraph: { images: OG_IMAGES, type: 'website', url: `${SITE_URL}/` },
    alternates: await localeAlternates('/'),
  };
}

export default async function PublicHomePage() {
  const brand = await getBrand();

  const [cyclesResult, clustersResult, finishLinesResult] = await Promise.all([
    loadPublicCycles(),
    loadPublicClusters(),
    loadPublicFinishLines(),
  ]);

  const cycles = Array.isArray(cyclesResult) ? cyclesResult : [];
  const clusters = Array.isArray(clustersResult) ? clustersResult : [];
  const finishLines = Array.isArray(finishLinesResult) ? finishLinesResult : [];

  const openCycle = cycles.find((c) => c.status === 'OPEN') ?? cycles[0];
  const registryResult = openCycle
    ? await loadPublicRegistry({ cycleId: openCycle.id, page: 1, limit: 1 })
    : null;

  const total = registryResult && 'total' in registryResult ? registryResult.total : null;
  const totalProposedBudget =
    registryResult && 'totalProposedBudget' in registryResult ? registryResult.totalProposedBudget : null;

  const officeIds = new Set(clusters.flatMap((c) => c.offices.map((o) => o.id)));

  // The hero figures need their cycle attached. Unlabelled, "₱147.87M" reads as
  // "the city's budget", when it is one partly-published proposal for one year.
  const publishedOfficeCount =
    registryResult && 'submittedOfficeCount' in registryResult
      ? registryResult.submittedOfficeCount
      : null;

  const stats =
    total != null && total > 0 && openCycle
      ? {
          budget: totalProposedBudget ? compactPeso(totalProposedBudget) : null,
          ppas: total,
          offices: officeIds.size > 0 ? officeIds.size : null,
          publishedOffices: publishedOfficeCount,
          visions: finishLines.length > 0 ? finishLines.length : null,
          fiscalYear: openCycle.fiscalYear,
          isProposal: !openCycle.sections.includes('annual'),
        }
      : undefined;

  const proposalYear = cyclesIn(cycles, 'aip')[0]?.fiscalYear ?? null;
  const enactedYear = cyclesIn(cycles, 'annual')[0]?.fiscalYear ?? null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml([
            { '@context': 'https://schema.org', '@type': 'WebSite', name: brand.siteName, url: SITE_URL },
            { '@context': 'https://schema.org', '@type': 'GovernmentOrganization', name: brand.government, ...(brand.website ? { url: brand.website } : {}) },
          ]),
        }}
      />
      <LandingPage
        city={{
          placeName: brand.placeName,
          shortName: brand.shortName,
          goals: finishLines.map((f) => ({ id: f.id, name: f.shortName ?? f.name, color: f.color ?? '#5A5754' })),
        }}
        stats={stats}
        proposalYear={proposalYear}
        enactedYear={enactedYear}
        live={liveBudgets(cycles)}
      />
    </>
  );
}
