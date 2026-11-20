import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import {
  apiGetOfficesAll,
  apiGetClustersAdmin,
  apiGetPapSectorsAll,
} from '@/lib/api';
import OfficeList from './office-list';

export default async function OfficesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Clusters and sectors populate the two inline dropdowns.
  const [offices, clusters, papSectors] = await Promise.all([
    apiGetOfficesAll(session.accessToken).catch(() => []),
    apiGetClustersAdmin(session.accessToken).catch(() => []),
    apiGetPapSectorsAll(session.accessToken).catch(() => []),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Offices</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Every office, grouped by office type. The office code and type are
        part of every AIP reference code beneath an office.
      </p>
      <OfficeList
        offices={offices}
        clusters={clusters}
        papSectors={papSectors}
      />
    </div>
  );
}
