import { notFound } from 'next/navigation';
import { localeRedirect } from '@/i18n/server';
import type { Metadata } from 'next';
import PublicPpmpDetailView from '@/components/public/public-ppmp-detail-view';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { loadSectionCycle } from '@/lib/public-section-page';
import { sectionHref } from '@/lib/public-sections';
import { loadPublicPpmp, loadPublicPpmpHistory, loadPublicPpmpFeedback } from '../../../_actions';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props { params: Promise<{ year: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, id } = await params;
  const result = await loadPublicPpmp(id);
  if ('error' in result) return {};
  const title = `${result.name} | PPMP ${year} | ${(await getBrand()).siteName}`;
  return {
    title,
    alternates: { canonical: canonical(`/ppmp/${result.aipCycle.fiscalYear}/plan/${id}`) },
    openGraph: { images: OG_IMAGES, title },
  };
}

/** One plan, inside its year's PPMP section with Browse as the current tab. */
export default async function PublicPpmpPlanPage({ params }: Props) {
  const { year, id } = await params;
  const [result, historyResult, feedbackResult] = await Promise.all([
    loadPublicPpmp(id),
    loadPublicPpmpHistory(id),
    loadPublicPpmpFeedback(id),
  ]);
  if ('error' in result) notFound();
  // A plan belongs to one year; a link with the wrong one is corrected, not 404'd.
  if (String(result.aipCycle.fiscalYear) !== year) {
    await localeRedirect(`/ppmp/${result.aipCycle.fiscalYear}/plan/${id}`);
  }
  const { cycle, years } = await loadSectionCycle('ppmp', year);

  return (
    <>
      <SectionChrome kind="ppmp" cycle={cycle} years={years} tab="browse" />
      <PublicPpmpDetailView
        ppmp={result}
        backHref={sectionHref('ppmp', cycle.fiscalYear, 'browse')}
        initialHistory={Array.isArray(historyResult) ? historyResult : []}
        initialFeedback={Array.isArray(feedbackResult) ? feedbackResult : []}
      />
    </>
  );
}
