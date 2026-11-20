import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetFinishLines } from '@/lib/api';
import FinishLineList from './finish-line-list';
import { GOALS } from '@/lib/goal-label';


export default async function FinishLinesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let finishLines: Awaited<ReturnType<typeof apiGetFinishLines>> = [];
  try {
    finishLines = await apiGetFinishLines(session.accessToken);
  } catch {
    // show empty state
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">{GOALS}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          The LGU&apos;s strategic vision statements, ordered by vision number.
        </p>
      </div>
      <FinishLineList finishLines={finishLines} />
    </div>
  );
}
