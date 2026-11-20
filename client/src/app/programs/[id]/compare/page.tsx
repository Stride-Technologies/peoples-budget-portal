import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { apiGetProgram, apiGetProgramVersions, apiCompareProgramVersions } from '@/lib/api';
import { ProgramCompareClient } from './program-compare-client';
import DraftCompare from '@/components/aip/draft-compare';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function ProgramComparePage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const { from, to } = await searchParams;

  const fromVersion = from ? parseInt(from, 10) : 1;
  const toVersion: number | 'current' = to === 'current' || !to ? 'current' : parseInt(to, 10);

  const [program, versions, comparison] = await Promise.all([
    apiGetProgram(session.accessToken, id).catch(() => null),
    apiGetProgramVersions(session.accessToken, id).catch(() => [] as Awaited<ReturnType<typeof apiGetProgramVersions>>),
    apiCompareProgramVersions(session.accessToken, id, fromVersion, toVersion).catch(() => null),
  ]);

  if (!program) redirect('/aip-registry');

  return (
    <>
      {/* Screen 5: draft vs what the public sees. Only meaningful while a
          revision is open — the version-vs-version compare below answers a
          different question and stays available in every state. */}
      {program.status === 'PUBLISHED_REVISION' && (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Draft vs published
            </h2>
            <DraftCompare programId={id} />
          </div>
        </div>
      )}
      <ProgramCompareClient
      program={program}
      versions={versions}
      comparison={comparison}
      fromVersion={fromVersion}
      toVersion={toVersion}
      />
    </>
  );
}
