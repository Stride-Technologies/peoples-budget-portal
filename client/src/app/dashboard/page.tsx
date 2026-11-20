import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, hasPermission } from '@/lib/session';
import {
  apiGetAipCycles,
  apiGetDashboardSummary,
  apiGetPrograms,
  apiGetSpecialFunds,
  type AipCycleRecord,
  type SpecialFundRecord,
  type DashboardSummary,
  type ProgramListItem,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpecialFundsNotice } from '@/components/aip/special-funds-notice';
import { formatPesoWhole } from '@/lib/currency-formatter';
import { getProgramStatusSolidClass } from '@/lib/program-status';
import {
  BudgetMix,
  BudgetPie,
  FundSourceMix,
  SubmissionsOverTime,
} from './dashboard-charts';
import { SubmissionProgress } from './submission-progress';
import { GOAL, GOALS } from '@/lib/goal-label';


// ─── helpers ─────────────────────────────────────────────────────────────────

const CYCLE_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  OPEN: 'Open for Submissions',
  CLOSED: 'Closed',
  LOCKED: 'Adopted',
  ADOPTED: 'Adopted',
};

const CYCLE_STATUS_COLOR: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-800',
  OPEN: 'bg-green-100 text-green-800',
  CLOSED: 'bg-neutral-100 text-neutral-700',
  LOCKED: 'bg-blue-100 text-blue-800',
  ADOPTED: 'bg-blue-100 text-blue-800',
};

const PROGRAM_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  HEAD_REVIEWED: 'Head Reviewed',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FOR_REVISION: 'For Revision',
  PUBLISHED: 'Published',
  PUBLISHED_REVISION: 'Draft changes',
  ARCHIVED: 'Archived',
};

// ─── sub-components (server) ──────────────────────────────────────────────────

function CycleBanner({ cycle }: { cycle: AipCycleRecord | null }) {
  if (!cycle) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
        <span className="mt-0.5 text-amber-500 text-lg">⚠</span>
        <div>
          <p className="font-semibold text-amber-900 text-sm">No active AIP cycle</p>
          <p className="text-amber-700 text-sm mt-0.5">
            Create and open an AIP cycle to allow program submissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4 flex items-center gap-3">
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${CYCLE_STATUS_COLOR[cycle.status] ?? 'bg-neutral-100 text-neutral-700'}`}>
        {CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status}
      </span>
      <p className="text-sm font-medium text-neutral-900">FY {cycle.fiscalYear} AIP Cycle</p>
      <span className="text-neutral-300">·</span>
      <p className="text-sm text-neutral-500">{cycle._count.programs} program{cycle._count.programs !== 1 ? 's' : ''} submitted</p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * The caller's own programs by status — the one part of the page that is still
 * personal rather than city-wide.
 *
 * Money reads the `*ProposedTotal` family, not `psTotal`/`mooeTotal`/`feTotal`/`coTotal`:
 * the line-item family is structurally 0 while line-item entry is deferred, so
 * the old bars rendered ₱0 for everyone.
 */
function MyProgramStats({ programs }: { programs: ProgramListItem[] }) {
  const counts: Record<string, number> = {};
  const totals = { ps: 0, mooe: 0, fe: 0, co: 0 };
  for (const p of programs) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    totals.ps += parseFloat(p.psProposedTotal ?? '0');
    totals.mooe += parseFloat(p.mooeProposedTotal ?? '0');
    totals.fe += parseFloat(p.feProposedTotal ?? '0');
    totals.co += parseFloat(p.coProposedTotal ?? '0');
  }

  const grandTotal = totals.ps + totals.mooe + totals.fe + totals.co;
  const max = Math.max(totals.ps, totals.mooe, totals.fe, totals.co, 1);

  const bars = [
    { label: 'Personnel Services', value: totals.ps, color: 'bg-blue-500' },
    { label: 'MOOE', value: totals.mooe, color: 'bg-green-500' },
    { label: 'Financial Expenses', value: totals.fe, color: 'bg-amber-500' },
    { label: 'Capital Outlay', value: totals.co, color: 'bg-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-3">Programs by Status</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([status, count]) => (
            <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${getProgramStatusSolidClass(status)}`}>
              {PROGRAM_STATUS_LABEL[status] ?? status}
              <span className="font-bold">{count}</span>
            </span>
          ))}
        </div>
      </div>
      {grandTotal > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">
            Budget Breakdown
            <span className="font-normal text-neutral-400 ml-2 text-xs">
              Total: {formatPesoWhole(grandTotal.toFixed(2))}
            </span>
          </h3>
          <div className="space-y-3">
            {bars.map((bar) => (
              <div key={bar.label} className="space-y-1">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>{bar.label}</span>
                  <span>{formatPesoWhole(bar.value.toFixed(2))}</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bar.color} transition-all`}
                    style={{ width: `${(bar.value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The city-wide tracker. Rendered identically for every role — that is the
 * point: an office can only judge its own progress against the same denominator
 * everyone else sees. The data comes from `/dashboard/summary`, which is
 * deliberately unscoped (see `api/src/dashboard/dashboard.service.ts`).
 */
function CityWideSection({ summary }: { summary: DashboardSummary }) {
  const {
    totals,
    budget,
    byFundSource,
    byFinishLine,
    byCluster,
    officesWithNoSubmissions,
  } = summary;
  const noSubmissionCount = officesWithNoSubmissions.length;

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="All Programs"
          value={totals.programs}
          sub={`FY ${summary.fiscalYear}`}
        />
        <StatCard label="Drafts" value={totals.drafts} />
        <StatCard
          label="Published"
          value={totals.published}
          sub={
            totals.programs > 0
              ? `${Math.round((totals.published / totals.programs) * 100)}% of all programs`
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Proposed Budget by {GOAL}</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetPie byFinishLine={byFinishLine} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle className="text-base">Submission Progress</CardTitle>
            {noSubmissionCount > 0 && (
              <p className="text-xs text-amber-700">
                {noSubmissionCount} office{noSubmissionCount === 1 ? '' : 's'} with
                no submissions
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SubmissionProgress byCluster={byCluster} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Programs Published Per Week</CardTitle>
          </CardHeader>
          <CardContent>
            <SubmissionsOverTime publishedByWeek={summary.publishedByWeek} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Budget Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetMix budget={budget} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Proposed Budget by Fund Source</CardTitle>
        </CardHeader>
        <CardContent>
          <FundSourceMix byFundSource={byFundSource} />
        </CardContent>
      </Card>
    </>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { role, identityType } = session.user;
  const token = session.accessToken;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isLgu = identityType === 'LGU';

  const cycles = await apiGetAipCycles(token).catch(() => [] as AipCycleRecord[]);
  const activeCycle =
    cycles.find((c) => c.status === 'OPEN') ??
    cycles.find((c) => c.status === 'PLANNING') ??
    cycles[0] ??
    null;

  // The city-wide summary is one unscoped aggregate; `apiGetPrograms` stays only
  // for the caller's own programs, where the visibility scoping is correct.
  const [summary, myPrograms, specialFunds] = await Promise.all([
    activeCycle
      ? apiGetDashboardSummary(token, activeCycle.id).catch(() => null)
      : Promise.resolve(null),
    !isSuperAdmin && activeCycle
      ? apiGetPrograms(token, { cycleId: activeCycle.id, pageSize: 100 }).catch(
          () => ({ items: [] as ProgramListItem[], total: 0, page: 1, pageSize: 100 }),
        )
      : Promise.resolve(null),
    activeCycle
      ? apiGetSpecialFunds(token, activeCycle.id).catch(() => [] as SpecialFundRecord[])
      : Promise.resolve([] as SpecialFundRecord[]),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            AIP submission progress, all offices
          </p>
        </div>
        {isSuperAdmin ? (
          <Link
            href="/control-panel/aip-cycles"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Manage Cycles
          </Link>
        ) : (
          activeCycle?.status === 'OPEN' && hasPermission(session.user, 'aip:write') && (
            <Link
              href="/programs/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + New Program
            </Link>
          )
        )}
      </div>

      {/* Cycle status banner */}
      <CycleBanner cycle={activeCycle} />

      {summary && <CityWideSection summary={summary} />}

      {/* Stated special-fund amounts sit outside every program total (specs/008). */}
      <SpecialFundsNotice funds={specialFunds} />

      {/* The caller's own programs — omitted for SUPER_ADMIN, who owns none. */}
      {myPrograms && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Programs</CardTitle>
          </CardHeader>
          <CardContent>
            {myPrograms.items.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-400 text-sm">No programs yet.</p>
                {activeCycle?.status === 'OPEN' && (
                  <Link
                    href="/programs/new"
                    className="mt-3 inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Start your first program
                  </Link>
                )}
              </div>
            ) : (
              <MyProgramStats programs={myPrograms.items} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(isSuperAdmin
          ? [
              { label: 'Manage Users', href: '/control-panel/users', desc: 'Invite and manage staff accounts' },
              { label: 'AIP Cycles', href: '/control-panel/aip-cycles', desc: 'Create cycles and set ceilings' },
              { label: 'AIP Registry', href: '/aip-registry', desc: 'Full program master list' },
            ]
          : [
              { label: 'AIP Registry', href: '/aip-registry', desc: 'View all submitted programs' },
              { label: GOALS, href: '/finish-lines', desc: 'Browse strategic outcome areas' },
            ]
        ).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <p className="text-sm font-semibold text-neutral-800">{link.label}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{link.desc}</p>
          </Link>
        ))}
      </div>

      {isLgu && !isSuperAdmin && (
        <Link
          href="/dashboard/feedback"
          className="block rounded-lg border border-neutral-200 bg-white px-4 py-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-800">Public Feedback</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                View analytics &amp; comments from citizens on your programs
              </p>
            </div>
            <span className="text-neutral-300 text-lg">›</span>
          </div>
        </Link>
      )}
    </div>
  );
}
