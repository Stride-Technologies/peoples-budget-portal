import { redirectToSection } from '@/lib/public-section-page';

/** `/annual/<year>` opens the year's first visible tab. */
export default async function AnnualYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  await redirectToSection('annual', year);
}
