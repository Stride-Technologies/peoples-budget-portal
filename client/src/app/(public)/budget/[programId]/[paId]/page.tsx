import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadPublicProgram, loadPublicProjectActivity, loadPAPublicFeedback, loadPublicCycles } from '../../_actions';
import { amountLabelFor } from '@/lib/public-sections';
import { PublicPADetailView } from '@/components/public/public-pa-detail-view';
import { canonical, OG_IMAGES, SITE_URL, jsonLdHtml } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props {
  params: Promise<{ programId: string; paId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { programId, paId } = await params;
  const result = await loadPublicProjectActivity(programId, paId);
  if ('error' in result) return { title: 'Project/Activity | AIP Registry' };
  const title = `${result.name} | AIP Registry`;
  const description = `View the ${result.name} project/activity in the ${(await getBrand()).placeName} Annual Investment Program registry.`;
  const url = canonical(`/budget/${programId}/${paId}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { images: OG_IMAGES, title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicPADetailPage({ params }: Props) {
  const { programId, paId } = await params;
  const [programResult, paResult, feedbackResult, cycles] = await Promise.all([
    loadPublicProgram(programId),
    loadPublicProjectActivity(programId, paId),
    loadPAPublicFeedback(programId, paId),
    loadPublicCycles(),
  ]);

  if ('error' in programResult || 'error' in paResult) notFound();

  const feedbackItems = Array.isArray(feedbackResult) ? feedbackResult : [];
  const programCode = programResult.aipReferenceCode ?? programResult.tentativeAipReferenceCode;
  const providerName =
    programResult.office?.name ??
    programResult.civilSocietyOrganization?.name ??
    (await getBrand()).government;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: paResult.name,
    description: paResult.description ?? undefined,
    url: canonical(`/budget/${programId}/${paId}`),
    provider: {
      "@type": "GovernmentOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: providerName,
    },
    areaServed: await getBrand().then((b) => ({ "@type": b.type === "city" ? "City" : "AdministrativeArea", name: b.placeName })),
    isPartOf: {
      "@type": "GovernmentService",
      name: programResult.name,
      url: canonical(`/budget/${programId}`),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(serviceJsonLd) }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <PublicPADetailView
          programId={programId}
          programName={programResult.name}
          programCode={programCode}
          pa={paResult}
          initialFeedback={feedbackItems}
          amountLabel={amountLabelFor(Array.isArray(cycles) ? cycles : [], programResult.aipCycle.fiscalYear)}
        />
      </div>
    </>
  );
}
