import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetClimateTypologyCodesAll } from '@/lib/api';
import ClimateTypologyCodeList from './climate-typology-code-list';

export default async function ClimateTypologyCodesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const codes = await apiGetClimateTypologyCodesAll(session.accessToken).catch(
    () => [],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          Climate Typology Codes
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          DBM-CCC CCET codes by pillar (Adaptation, Mitigation, Crosscutting).
        </p>
      </div>
      <ClimateTypologyCodeList codes={codes} />
    </div>
  );
}
