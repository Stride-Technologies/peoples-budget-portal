import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetOffices } from '@/lib/api';
import { EditHistoryFeed } from './edit-history-feed';

/**
 * The cross-program edit history (publish-scope §3.6): every change to every
 * program the viewer can audit, newest first. Bounded by office scope on the
 * API, so an office head sees their offices and an all-offices admin the city.
 */
export default async function EditHistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const offices = await apiGetOffices(session.accessToken).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Edit History</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every change to every program you can audit — who changed what, when,
          and for which office. Append-only.
        </p>
      </div>
      <EditHistoryFeed
        offices={offices.map((o) => ({ id: o.id, acronym: o.acronym, name: o.name }))}
      />
    </div>
  );
}
