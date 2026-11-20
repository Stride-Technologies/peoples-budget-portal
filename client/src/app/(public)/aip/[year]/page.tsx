import { redirectToSection } from '@/lib/public-section-page';

/** `/aip/<year>` opens the year's first visible tab. */
export default async function AipYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  await redirectToSection('aip', year);
}
