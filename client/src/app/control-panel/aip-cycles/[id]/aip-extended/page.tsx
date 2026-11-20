import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { apiGetAipCycle } from '@/lib/api';
import { AipExtendedImport } from './_aip-extended-import';

export default async function AipExtendedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/control-panel');
  const cycle = await apiGetAipCycle(session.accessToken, id).catch(() => null);
  if (!cycle) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/control-panel/aip-cycles/${id}`}
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-700"
        >
          ← FY {cycle.fiscalYear} cycle
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-neutral-900">
          AIP-Extended sheet — FY {cycle.fiscalYear}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-neutral-500">
          Upload an office&apos;s PPMP workbook. Each coded row of its AIP-Extended sheet is
          matched to the AIP entry with the same code; where the code is not in the AIP, choose
          the entry yourself. Filling only writes blank indicators and targets and adds SDG
          goals — anything the office already typed is kept.
        </p>
      </div>
      <AipExtendedImport cycleId={id} />
    </div>
  );
}
