import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetSglgIndicatorsAll } from '@/lib/api';
import SglgIndicatorList from './sglg-indicator-list';

export default async function SglgIndicatorsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const indicators = await apiGetSglgIndicatorsAll(session.accessToken).catch(
    () => [],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">SGLG Indicators</h1>
        <p className="text-sm text-neutral-500 mt-1">
          DILG Seal of Good Local Governance framework indicators by pillar and year.
        </p>
      </div>
      <SglgIndicatorList indicators={indicators} />
    </div>
  );
}
