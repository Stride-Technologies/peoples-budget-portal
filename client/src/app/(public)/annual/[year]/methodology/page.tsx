import type { Metadata } from 'next';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { Methodology } from '@/components/public/editorial/methodology';
import { loadSectionCycle } from '@/lib/public-section-page';
import { loadOverview } from '@/lib/public-overview-data';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props { params: Promise<{ year: string }> }

const DESCRIPTION = "How the enacted Annual Budget was recorded here, what was verified against the printed book, and what is missing.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const description = DESCRIPTION.replace('{placeName}', brand.placeName);
  const title = `Methodology | Annual Budget ${year} | ${brand.placeName}`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/annual/${year}/methodology`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

export default async function MethodologyPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('annual', year, 'methodology');
  const data = await loadOverview(cycle, 'annual');

  return (
    <>
      <SectionChrome kind="annual" cycle={cycle} years={years} tab="methodology" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Methodology kind="annual" fiscalYear={cycle.fiscalYear} data={data} />
      </div>
    </>
  );
}
