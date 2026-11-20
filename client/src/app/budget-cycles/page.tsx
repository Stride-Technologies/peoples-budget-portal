import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, hasPermission } from '@/lib/session';
import { apiGetAipCycles, apiListBudgetDocuments, type BudgetDocumentRecord } from '@/lib/api';
import { StartLepButton } from './_start-lep';
import { KIND_LABEL, STATUS_COLOR, STATUS_LABEL, formatDate } from './_labels';

/**
 * Budget documents (specs/012 P4): each year's LEP and Appropriation Ordinance.
 * Imports run from the command line; staff review and finalize them here.
 */
export default async function BudgetDocumentsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (!hasPermission(session.user, 'budget:read')) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-neutral-900">Budget documents</h1>
        <p className="mt-2 text-sm text-neutral-500">
          You do not have access to budget documents. Ask a super admin if you need it.
        </p>
      </div>
    );
  }

  const [docs, cycles] = await Promise.all([
    apiListBudgetDocuments(session.accessToken).catch(() => null),
    apiGetAipCycles(session.accessToken).catch(() => []),
  ]);
  // An adopted AIP with programs and no LEP yet can start one (specs/012 D10).
  const canStart =
    hasPermission(session.user, 'budget:write') && docs !== null
      ? cycles.filter(
          (c) =>
            (c.status === 'ADOPTED' || c.status === 'LOCKED') &&
            c._count.programs > 0 &&
            !docs.some((d) => d.budgetCycle.fiscalYear === c.fiscalYear && d.kind === 'LEP'),
        )
      : [];
  const years = new Map<number, BudgetDocumentRecord[]>();
  for (const d of docs ?? []) {
    const fy = d.budgetCycle.fiscalYear;
    years.set(fy, [...(years.get(fy) ?? []), d]);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Budget documents</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Each year&apos;s Local Expenditure Program and Appropriation Ordinance, as imported
          from the LGU&apos;s files. Review imported rows and enact the Ordinance here.
        </p>
      </div>

      {canStart.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-700">Start the LEP</h2>
          <p className="text-xs text-neutral-500 mt-1 mb-3">
            Makes a draft Local Expenditure Program from the adopted AIP and the approved PPMPs:
            every program, project and activity with its amounts, for the budget office to review.
          </p>
          <div className="flex flex-wrap gap-3">
            {canStart.map((c) => (
              <StartLepButton key={c.id} aipCycleId={c.id} fiscalYear={c.fiscalYear} />
            ))}
          </div>
        </div>
      )}

      {docs === null ? (
        <p className="text-sm text-red-600">The documents could not be loaded. Please try again.</p>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-5 py-8 text-center">
          <p className="text-sm text-neutral-600">No budget documents yet.</p>
          <p className="text-xs text-neutral-400 mt-1">
            They are imported with <code>pnpm --filter api db:seed:document</code>.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Year</th>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">PPAs</th>
                <th className="px-4 py-2.5 font-medium">Finalized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {[...years.entries()].flatMap(([fy, list]) =>
                list.map((d, i) => (
                  <tr key={d.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono tabular-nums text-neutral-900">
                      {i === 0 ? fy : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/budget-cycles/${fy}/documents/${d.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {KIND_LABEL[d.kind]}
                      </Link>
                      {d.ordinanceDetail?.ordinanceNumber && (
                        <span className="ml-2 text-xs text-neutral-500">
                          No. {d.ordinanceDetail.ordinanceNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{d._count.items}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(d.finalizedAt)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
