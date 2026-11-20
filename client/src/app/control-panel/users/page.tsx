import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import {
  apiGetUsers,
  apiGetOffices,
  apiGetCivilSocietyOrganizations,
  apiGetDevMailOutbox,
  apiGetClusters,
} from '@/lib/api';
import UserTable from './user-table';
import DevMailOutbox from './dev-mail-outbox';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [users, offices, csos, devMailOutbox, clusters] =
    await Promise.allSettled([
      apiGetUsers(session.accessToken),
      apiGetOffices(session.accessToken),
      apiGetCivilSocietyOrganizations(session.accessToken),
      apiGetDevMailOutbox(session.accessToken),
      // Offices come nested under clusters, which is exactly the grouping the
      // scope picker renders (D2 — grouped by cluster, stored per office).
      apiGetClusters(session.accessToken),
    ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Users</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage portal access and send invitations.
        </p>
      </div>
      <UserTable
        users={users.status === 'fulfilled' ? users.value : []}
        offices={
          offices.status === 'fulfilled' ? offices.value : []
        }
        csos={csos.status === 'fulfilled' ? csos.value : []}
        clusters={clusters.status === 'fulfilled' ? clusters.value : []}
        currentUserRole={session.user.role}
      />
      {devMailOutbox.status === 'fulfilled' && (
        <DevMailOutbox items={devMailOutbox.value} />
      )}
    </div>
  );
}
