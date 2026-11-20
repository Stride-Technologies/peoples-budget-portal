import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetUacsObjectsAll } from '@/lib/api';
import UacsObjectList from './uacs-object-list';

export default async function UacsObjectsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const objects = await apiGetUacsObjectsAll(session.accessToken).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">UACS Objects</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Unified Accounts Code Structure objects by expense class (PS, MOOE, FE, CO).
        </p>
      </div>
      <UacsObjectList objects={objects} />
    </div>
  );
}
