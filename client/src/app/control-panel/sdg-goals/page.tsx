import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetSdgGoalsAll } from '@/lib/api';
import SdgGoalList from './sdg-goal-list';

export default async function SdgGoalsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const goals = await apiGetSdgGoalsAll(session.accessToken).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">SDG Goals</h1>
        <p className="text-sm text-neutral-500 mt-1">
          UN 2030 Agenda Sustainable Development Goals that programs can be tagged
          against.
        </p>
      </div>
      <SdgGoalList goals={goals} />
    </div>
  );
}
