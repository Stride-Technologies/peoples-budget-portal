import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadPublicProgram, loadPublicFeedback, loadPublicCycles } from '../_actions';
import { amountLabelFor } from '@/lib/public-sections';
import { PublicProgramDetailView } from '@/components/public/public-program-detail-view';
import { canonical, OG_IMAGES, SITE_URL } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props {
  params: Promise<{ programId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { programId } = await params;
  const result = await loadPublicProgram(programId);
  if ('error' in result) return { title: 'Program | AIP Registry' };
  const title = `${result.name} | AIP Registry`;
  const description = result.description
    ? String(result.description).slice(0, 160)
    : `View the ${result.name} program in the ${(await getBrand()).placeName} Annual Investment Program registry.`;
  const url = canonical(`/budget/${programId}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { images: OG_IMAGES, title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicProgramDetailPage({ params }: Props) {
  const { programId } = await params;
  const [programResult, feedbackResult, cycles] = await Promise.all([
    loadPublicProgram(programId),
    loadPublicFeedback(programId),
    loadPublicCycles(),
  ]);

  if ('error' in programResult) notFound();

  const feedbackItems = Array.isArray(feedbackResult) ? feedbackResult : [];
  const brand = await getBrand();
  const providerName =
    programResult.office?.name ??
    programResult.civilSocietyOrganization?.name ??
    brand.government;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: programResult.name,
    description: programResult.description ?? undefined,
    url: canonical(`/budget/${programId}`),
    provider: {
      "@type": "GovernmentOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: providerName,
    },
    areaServed: { "@type": "AdministrativeArea", name: brand.placeName },
    ...(programResult.aipReferenceCode
      ? { identifier: programResult.aipReferenceCode }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/budget"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to AIP
      </Link>

      <PublicProgramDetailView
        program={programResult}
        initialFeedback={feedbackItems}
        programId={programId}
        amountLabel={amountLabelFor(Array.isArray(cycles) ? cycles : [], programResult.aipCycle.fiscalYear)}
      />
    </div>
    </>
  );
}
