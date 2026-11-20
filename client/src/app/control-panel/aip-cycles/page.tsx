import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { apiGetAipCycles, type AipCycleRecord } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  OPEN: 'Open',
  CLOSED: 'Closed',
  LOCKED: 'Adopted',
  ADOPTED: 'Adopted',
};

const STATUS_COLOR: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-800',
  OPEN: 'bg-green-100 text-green-800',
  CLOSED: 'bg-neutral-100 text-neutral-600',
  LOCKED: 'bg-blue-100 text-blue-700',
  ADOPTED: 'bg-blue-100 text-blue-700',
};

function CycleRow({ cycle }: { cycle: AipCycleRecord }) {
  return (
    <tr className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-semibold text-neutral-900">FY {cycle.fiscalYear}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[cycle.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
          {STATUS_LABEL[cycle.status] ?? cycle.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500">
        {cycle._count.ceilings} ceiling{cycle._count.ceilings !== 1 ? 's' : ''}
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500">
        {cycle._count.programs} program{cycle._count.programs !== 1 ? 's' : ''}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/control-panel/aip-cycles/${cycle.id}`}
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          Manage →
        </Link>
      </td>
    </tr>
  );
}

export default async function AipCyclesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/control-panel');

  const cycles = await apiGetAipCycles(session.accessToken).catch(() => [] as AipCycleRecord[]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">AIP Cycles</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Create and manage Annual Investment Program cycles.
          </p>
        </div>
        <Link
          href="/control-panel/aip-cycles/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Cycle
        </Link>
      </div>

      {cycles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center">
          <p className="text-neutral-500 text-sm">No AIP cycles yet.</p>
          <Link
            href="/control-panel/aip-cycles/new"
            className="mt-3 inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Create the first cycle
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Fiscal Year</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Ceilings</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Programs</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <CycleRow key={cycle.id} cycle={cycle} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
