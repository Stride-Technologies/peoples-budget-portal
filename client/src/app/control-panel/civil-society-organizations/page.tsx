import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetCsosAll, apiGetClusters } from '@/lib/api';
import CsoList from './cso-list';

export default async function CivilSocietyOrganizationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [csos, clusters] = await Promise.all([
    apiGetCsosAll(session.accessToken).catch(() => []),
    apiGetClusters(session.accessToken).catch(() => []),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          Civil Society Organizations
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          NCPC sectors and their cluster assignments.
        </p>
      </div>
      <CsoList csos={csos} clusters={clusters} />
    </div>
  );
}
