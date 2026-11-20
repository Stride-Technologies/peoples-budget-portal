import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetClustersAdmin } from '@/lib/api';
import ClusterList from './cluster-list';

export default async function ClustersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let clusters: Awaited<ReturnType<typeof apiGetClustersAdmin>> = [];
  try {
    clusters = await apiGetClustersAdmin(session.accessToken);
  } catch {
    // show empty state
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Clusters</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage the strategic clusters and their full names. Each cluster lists
          the offices in it; offices themselves are managed under Offices.
        </p>
      </div>
      <ClusterList clusters={clusters} />
    </div>
  );
}
