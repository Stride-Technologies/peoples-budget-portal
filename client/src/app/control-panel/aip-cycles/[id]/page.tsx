import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import {
  apiGetAipCycle,
  apiGetFinishLineCeiling,
  apiGetFinishLines,
  apiGetSpecialFunds,
  type SpecialFundRecord,
  type FinishLineCeilingDetailRecord,
  type FinishLineCeilingHistoryRecord,
  type FinishLineRecord,
} from '@/lib/api';
import { CeilingEditor } from './_ceiling-editor';
import { StatusTransition } from './_status-transition';
import { PublicComparisonToggle } from './_public-comparison-toggle';
import { PublicOverviewSwitches } from './_public-overview-switches';
import { OpenDataToggle } from './_open-data-toggle';
import { SpecialFundsEditor } from './_special-funds';
import { StageSetter } from './_stage-setter';
import { GOAL, goal, goals } from '@/lib/goal-label';


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

type CeilingHistoryRow = FinishLineCeilingHistoryRecord & {
  finishLineName: string;
  nextTotalCeiling: string;
};

function formatPeso(value: string) {
  return `₱${parseFloat(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUser(entry: FinishLineCeilingHistoryRecord) {
  if (!entry.changedByUser) return 'Unknown user';
  return `${entry.changedByUser.firstName} ${entry.changedByUser.lastName}`.trim();
}

function CeilingHistory({ rows }: { rows: CeilingHistoryRow[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-700">Recent ceiling changes</h3>
        <p className="text-xs text-neutral-500 mt-1">
          Each entry summarizes what changed and who made the update.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-400">No ceiling updates recorded yet.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <div key={row.id} className="px-4 py-3">
              <p className="text-sm text-neutral-800">
                Updated <span className="font-medium">{row.finishLineName}</span> from{' '}
                <span className="font-medium">{formatPeso(row.totalCeiling)}</span> to{' '}
                <span className="font-medium">{formatPeso(row.nextTotalCeiling)}</span>.
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Changed by {formatUser(row)} ·{' '}
                {new Date(row.changedAt).toLocaleString('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AipCycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/control-panel');

  const [cycle, finishLines, specialFunds] = await Promise.all([
    apiGetAipCycle(session.accessToken, id).catch(() => null),
    apiGetFinishLines(session.accessToken).catch(() => [] as FinishLineRecord[]),
    apiGetSpecialFunds(session.accessToken, id).catch(() => [] as SpecialFundRecord[]),
  ]);

  if (!cycle) notFound();

  const ceilingDetails = await Promise.all(
    cycle.ceilings.map((ceiling) =>
      apiGetFinishLineCeiling(session.accessToken, ceiling.id).catch(
        () => null as FinishLineCeilingDetailRecord | null,
      ),
    ),
  );
  const historyRows = ceilingDetails
    .filter((ceiling): ceiling is FinishLineCeilingDetailRecord => ceiling !== null)
    .flatMap((ceiling) => {
      const history = [...ceiling.history].sort(
        (a, b) =>
          new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
      );
      return history.map((entry, index) => {
        const newerEntry = history[index - 1];
        return {
          ...entry,
          finishLineName: ceiling.finishLine?.name ?? `Unknown ${goal}`,
          nextTotalCeiling: newerEntry?.totalCeiling ?? ceiling.totalCeiling,
        };
      });
    })
    .sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )
    .slice(0, 10);

  const canEditCeilings =
    cycle.status === 'PLANNING' || cycle.status === 'OPEN';
  const ceilingCount = cycle.ceilings.length;
  const totalCeiling = cycle.ceilings.reduce((sum, c) => sum + parseFloat(c.totalCeiling), 0);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/control-panel/aip-cycles"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          ← AIP Cycles
        </Link>
        <div className="flex items-center gap-3 mt-3">
          <h1 className="text-xl font-bold text-neutral-900">FY {cycle.fiscalYear} AIP Cycle</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[cycle.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
            {STATUS_LABEL[cycle.status] ?? cycle.status}
          </span>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {cycle._count.programs} program{cycle._count.programs !== 1 ? 's' : ''} · {ceilingCount} of {finishLines.length} {goals} have ceilings set
          {ceilingCount > 0 && ` · ₱${totalCeiling.toLocaleString('en-PH')} total ceiling`}
        </p>
      </div>

      {/* Status transition */}
      <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Cycle Status</h2>
        <div className="flex items-center gap-4 flex-wrap">
          {(['PLANNING', 'OPEN', 'CLOSED', 'ADOPTED'] as const).map((s, i) => {
            const statuses = ['PLANNING', 'OPEN', 'CLOSED', 'ADOPTED'];
            // LOCKED is the pre-specs/012 name for ADOPTED.
            const status = cycle.status === 'LOCKED' ? 'ADOPTED' : cycle.status;
            const current = statuses.indexOf(status);
            const idx = statuses.indexOf(s);
            const isDone = idx < current;
            const isActive = s === status;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-6 ${isDone || isActive ? 'bg-blue-400' : 'bg-neutral-200'}`} />}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  isActive ? `${STATUS_COLOR[s]} ring-2 ring-offset-1 ring-current` :
                  isDone ? 'bg-blue-50 text-blue-400' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {isDone && <span>✓</span>}
                  {STATUS_LABEL[s]}
                </div>
              </div>
            );
          })}
        </div>
        {cycle.status !== 'LOCKED' && cycle.status !== 'ADOPTED' && (
          <div className="mt-4">
            <StatusTransition cycleId={cycle.id} currentStatus={cycle.status} />
          </div>
        )}
        {cycle.status === 'PLANNING' && ceilingCount === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            At least one budget ceiling must be set before opening the cycle.
          </p>
        )}
      </div>

      {/* Where the whole budget stands — the AIP is one stage of it (specs/012) */}
      <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-neutral-700">Budget stage</h2>
        <p className="mb-3 max-w-prose text-xs text-neutral-500">
          Where FY {cycle.fiscalYear}&rsquo;s budget is in the cycle. The public home page and the
          Learn page show it.
        </p>
        <StageSetter
          aipCycleId={cycle.id}
          budgetCycleId={cycle.budgetCycle.id}
          currentStage={cycle.budgetCycle.currentStage}
          alongsideStages={cycle.budgetCycle.alongsideStages}
        />
      </div>

      {/* What the public site shows for this year */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">
          Public Overview
        </h2>
        <PublicOverviewSwitches
          cycleId={cycle.id}
          fiscalYear={cycle.fiscalYear}
          // The API's sections — the same rule the public routes use.
          sections={cycle.sections}
          enabled={{
            AIP: cycle.publicAipOverviewEnabled,
            ANNUAL: cycle.publicAnnualOverviewEnabled,
            PPMP: cycle.publicPpmpOverviewEnabled,
          }}
        />
        <div className="mt-4">
          <PublicComparisonToggle
            cycleId={cycle.id}
            enabled={cycle.publicComparisonEnabled}
          />
        </div>
        <div className="mt-5">
          <OpenDataToggle cycleId={cycle.id} enabled={cycle.openDataEnabled} />
        </div>
      </div>

      {/* Special funds' stated amounts — LBP Form 7 lump sums (specs/008) */}
      <div>
        <h2 className="mb-1 text-sm font-semibold text-neutral-700">Special funds</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Staff-only. Printed on LBP Form 7; never in public totals or open data.
        </p>
        <SpecialFundsEditor cycleId={cycle.id} funds={specialFunds} />
      </div>

      {/* AIP-Extended upload — indicators, targets, SDG goals (specs/008 US3) */}
      <div>
        <h2 className="mb-1 text-sm font-semibold text-neutral-700">AIP-Extended sheets</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Fill blank performance indicators, targets and SDG goals from an office&apos;s PPMP
          workbook, matching each row to its AIP entry.
        </p>
        <Link
          href={`/control-panel/aip-cycles/${cycle.id}/aip-extended`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Upload an AIP-Extended sheet →
        </Link>
      </div>

      {/* Budget ceiling editor */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Budget Ceilings by {GOAL}</h2>
        <CeilingEditor
          cycleId={cycle.id}
          finishLines={finishLines}
          ceilings={cycle.ceilings}
          disabled={!canEditCeilings}
        />
      </div>

      <CeilingHistory rows={historyRows} />
    </div>
  );
}
