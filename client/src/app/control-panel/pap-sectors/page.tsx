import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetPapSectorsAll } from '@/lib/api';
import PapSectorList from './pap-sector-list';

export default async function PapSectorsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const sectors = await apiGetPapSectorsAll(session.accessToken).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">PAP Sectors</h1>
        <p className="text-sm text-neutral-500 mt-1">
          DBM BOM Annex 2 program/activity/project sector codes.
        </p>
      </div>
      <PapSectorList sectors={sectors} />
    </div>
  );
}
