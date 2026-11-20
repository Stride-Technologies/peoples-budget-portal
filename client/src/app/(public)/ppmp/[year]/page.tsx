import { notFound } from 'next/navigation';
import { localeRedirect } from '@/i18n/server';
import { redirectToSection } from '@/lib/public-section-page';
import { apiPublicGetPpmp } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/ppmp/<year>` opens the year's first visible tab.
 *
 * The same segment is where a plan used to live (`/ppmp/<uuid>`, before the
 * section had years), so a uuid is looked up and sent to the plan's page in its
 * year — old links keep working. One dynamic segment, not two: Next cannot tell
 * `[year]` and `[id]` apart at the same level.
 */
export default async function PpmpYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  if (UUID.test(year)) {
    const plan = await apiPublicGetPpmp(year).catch(() => null);
    if (!plan) notFound();
    await localeRedirect(`/ppmp/${plan.aipCycle.fiscalYear}/plan/${plan.id}`);
  }
  await redirectToSection('ppmp', year);
}
