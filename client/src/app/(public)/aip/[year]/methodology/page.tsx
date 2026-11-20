import type { Metadata } from 'next';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { AipReadingGuide } from '@/components/public/aip-reading-guide';
import { aipReadingGuideFigures } from '@/lib/aip-reading-guide-copy';
import { Methodology } from '@/components/public/editorial/methodology';
import { loadSectionCycle } from '@/lib/public-section-page';
import { loadOverview } from '@/lib/public-overview-data';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props { params: Promise<{ year: string }> }

const DESCRIPTION = "Where the Annual Investment Program figures come from, what they cover, and what they do not.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const description = DESCRIPTION.replace('{placeName}', brand.placeName);
  const title = `Methodology | Annual Investment Program ${year} | ${brand.placeName}`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/aip/${year}/methodology`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

export default async function MethodologyPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years, cycles } = await loadSectionCycle('aip', year, 'methodology');
  const data = await loadOverview(cycle, 'aip');

  return (
    <>
      <SectionChrome
        kind="aip"
        cycle={cycle}
        years={years}
        tab="methodology"
        notice={
          <AipReadingGuide
            fiscalYear={cycle.fiscalYear}
            figures={aipReadingGuideFigures(cycle, cycles, data.coverage.totalProposed)}
          />
        }
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Methodology kind="aip" fiscalYear={cycle.fiscalYear} data={data} />
      </div>
    </>
  );
}
