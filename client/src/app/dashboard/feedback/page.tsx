import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import {
  apiGetAipCycles,
  apiGetLguFeedback,
  apiGetAdminRegistryFeedback,
  apiGetAdminProgramFeedback,
  type AipCycleRecord,
  type LguFeedbackListResponse,
  type RegistryFeedbackListResponse,
  type ProgramFeedbackListResponse,
} from '@/lib/api';
import FeedbackTable from './feedback-table';
import AdminProgramFeedbackTable from './admin-program-feedback-table';
import CyclePicker from './cycle-picker';
import GeneralFeedbackTable from './general-feedback-table';

const EMPTY_LGU: LguFeedbackListResponse = { items: [], total: 0, page: 1, limit: 10 };
const EMPTY_REGISTRY: RegistryFeedbackListResponse = { items: [], total: 0, page: 1, limit: 10 };
const EMPTY_ADMIN_PROGRAM: ProgramFeedbackListResponse = { items: [], total: 0, page: 1, limit: 10 };

/**
 * A bare `.catch(() => EMPTY_*)` made a permission failure indistinguishable
 * from a genuinely empty result: both produced zero rows, so both rendered
 * "No feedback found for this cycle." and a user who simply lacked access was
 * told there was nothing to see. The thrown error carries `statusCode`
 * (lib/api.ts), so keep it and let the table say which case it is.
 */
async function fetchFeedback<T>(
  request: Promise<T>,
  empty: T,
): Promise<{ data: T; denied: boolean }> {
  try {
    return { data: await request, denied: false };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return { data: empty, denied: status === 401 || status === 403 };
  }
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    cycleId?: string;
    page?: string;
    limit?: string;
    filter?: string;
    category?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { role } = session.user;
  const isLgu = !!session.user.officeId;
  const isAdmin = role === 'HEAD' || role === 'SUPER_ADMIN';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const canAct = isAdmin;
  // SUPER_ADMIN (and any non-office admin) moderates feedback across ALL programs
  // via the admin endpoint, rather than the office-scoped LGU view.
  const useAdminProgramView = isSuperAdmin || (isAdmin && !isLgu);

  // Must be LGU staff or admin
  if (!isLgu && !isAdmin) redirect('/dashboard');

  const token = session.accessToken;
  const params = await searchParams;

  const activeTab = params.tab === 'general' ? 'general' : 'program';
  const pageNum = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  // ── Program tab params (LGU path) ────────────────────────────────────────
  const parsedLimit = parseInt(params.limit ?? '10', 10);
  const limit = [10, 20, 50].includes(parsedLimit) ? parsedLimit : 10;
  // 'deleted' is only meaningful for the SUPER_ADMIN trash view.
  const filter = (['all', 'pending', 'reviewed', 'deleted'] as const).includes(
    params.filter as 'all' | 'pending' | 'reviewed' | 'deleted',
  )
    ? (params.filter as 'all' | 'pending' | 'reviewed' | 'deleted')
    : 'all';

  // ── General tab params ───────────────────────────────────────────────────
  const generalFilter = (['all', 'pending', 'reviewed', 'deleted'] as const).includes(
    params.filter as 'all' | 'pending' | 'reviewed' | 'deleted',
  )
    ? (params.filter as 'all' | 'pending' | 'reviewed' | 'deleted')
    : 'all';
  const parsedGeneralLimit = parseInt(params.limit ?? '10', 10);
  const generalLimit = [10, 20, 50].includes(parsedGeneralLimit) ? parsedGeneralLimit : 10;
  const category = params.category ?? '';

  // ── Fetch cycles (LGU path only) ─────────────────────────────────────────
  const cycles = isLgu
    ? await apiGetAipCycles(token).catch(() => [] as AipCycleRecord[])
    : [];
  const activeCycle =
    cycles.find((c) => c.status === 'OPEN') ??
    cycles.find((c) => c.status === 'PLANNING') ??
    cycles[0] ??
    null;
  const cycleId = params.cycleId ?? activeCycle?.id ?? '';

  // ── Fetch data based on active tab and role ───────────────────────────────
  let lguFeedback = EMPTY_LGU;
  let adminProgramFeedback = EMPTY_ADMIN_PROGRAM;
  let generalFeedback = EMPTY_REGISTRY;
  let generalUnreviewed = 0;
  let programUnreviewed = 0;
  let programAccessDenied = false;
  let generalAccessDenied = false;

  // Program-feedback pending count for the tab badge: cross-program for admins,
  // office-scoped per-cycle for LGU users.
  async function fetchProgramUnreviewed(): Promise<number> {
    if (useAdminProgramView) {
      const pending = await apiGetAdminProgramFeedback(token, { reviewed: false, page: 1, limit: 1 }).catch(() => EMPTY_ADMIN_PROGRAM);
      return pending.total;
    }
    if (isLgu && cycleId) {
      const pending = await apiGetLguFeedback(token, { cycleId, page: 1, limit: 1, filter: 'pending' }).catch(() => EMPTY_LGU);
      return pending.total;
    }
    return 0;
  }

  if (activeTab === 'program') {
    if (useAdminProgramView) {
      const reviewedParam = filter === 'reviewed' ? true : filter === 'pending' ? false : undefined;
      const result = await fetchFeedback(
        apiGetAdminProgramFeedback(
          token,
          filter === 'deleted'
            ? { deleted: true, page: pageNum, limit }
            : { reviewed: reviewedParam, page: pageNum, limit },
        ),
        EMPTY_ADMIN_PROGRAM,
      );
      adminProgramFeedback = result.data;
      programAccessDenied = result.denied;
      programUnreviewed = filter === 'pending' ? adminProgramFeedback.total : await fetchProgramUnreviewed();
    } else if (isLgu && cycleId) {
      // The office-scoped LGU view has no trash; 'deleted' only applies to admin tabs.
      const lguFilter = filter === 'deleted' ? 'all' : filter;
      const result = await fetchFeedback(
        apiGetLguFeedback(token, { cycleId, page: pageNum, limit, filter: lguFilter }),
        EMPTY_LGU,
      );
      lguFeedback = result.data;
      programAccessDenied = result.denied;
      programUnreviewed = filter === 'pending' ? lguFeedback.total : await fetchProgramUnreviewed();
    }
    // Also fetch unreviewed count for general tab badge
    generalFeedback = await apiGetAdminRegistryFeedback(token, { reviewed: false, page: 1, limit: 1 })
      .catch(() => EMPTY_REGISTRY);
    generalUnreviewed = generalFeedback.total;
  } else {
    const reviewedParam =
      generalFilter === 'reviewed' ? true : generalFilter === 'pending' ? false : undefined;
    const result = await fetchFeedback(
      apiGetAdminRegistryFeedback(
        token,
        generalFilter === 'deleted'
          ? { category: category || undefined, deleted: true, page: pageNum, limit: generalLimit }
          : { category: category || undefined, reviewed: reviewedParam, page: pageNum, limit: generalLimit },
      ),
      EMPTY_REGISTRY,
    );
    generalFeedback = result.data;
    generalAccessDenied = result.denied;
    generalUnreviewed =
      generalFilter !== 'reviewed' && generalFilter !== 'deleted' ? generalFeedback.total : 0;
    // Fetch program unreviewed count for program tab badge
    programUnreviewed = await fetchProgramUnreviewed();
  }

  const programTabHref = `/dashboard/feedback?tab=program&page=1${cycleId ? `&cycleId=${cycleId}` : ''}`;
  const generalTabHref = `/dashboard/feedback?tab=general&page=1`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Public Feedback</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Citizens&apos; feedback submitted via the public AIP registry
            </p>
          </div>
          {activeTab === 'program' && isLgu && cycles.length > 1 && cycleId ? (
            <CyclePicker cycles={cycles} selectedId={cycleId} />
          ) : activeTab === 'program' && isLgu && cycleId && cycles.length === 1 ? (
            <span className="text-sm text-neutral-500">
              FY {cycles[0].fiscalYear}{cycles[0].status === 'OPEN' ? ' (Active)' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-200">
        <TabLink href={programTabHref} active={activeTab === 'program'}>
          Program Feedback
          {programUnreviewed > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-medium w-5 h-5">
              {programUnreviewed > 99 ? '99+' : programUnreviewed}
            </span>
          )}
        </TabLink>
        <TabLink href={generalTabHref} active={activeTab === 'general'}>
          General Feedback
          {generalUnreviewed > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-medium w-5 h-5">
              {generalUnreviewed > 99 ? '99+' : generalUnreviewed}
            </span>
          )}
        </TabLink>
      </div>

      {/* Tab content */}
      {activeTab === 'program' ? (
        useAdminProgramView ? (
          <AdminProgramFeedbackTable
            data={adminProgramFeedback}
            currentLimit={limit}
            currentFilter={filter}
            canDelete={isSuperAdmin}
            canViewDeleted={isAdmin}
            accessDenied={programAccessDenied}
          />
        ) : isLgu ? (
          !cycleId ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm text-amber-800">
                No AIP cycle found. Feedback will appear once a cycle is created.
              </p>
            </div>
          ) : (
            <>
              <FeedbackTable
                initialData={lguFeedback}
                cycleId={cycleId}
                limit={limit}
                filter={filter === 'deleted' ? 'all' : filter}
                accessDenied={programAccessDenied}
              />
            </>
          )
        ) : null
      ) : (
        <GeneralFeedbackTable
          data={generalFeedback}
          currentCategory={category}
          currentPage={pageNum}
          currentLimit={generalLimit}
          currentFilter={generalFilter}
          canAct={canAct}
          canDelete={isSuperAdmin}
          accessDenied={generalAccessDenied}
        />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-neutral-500 hover:text-neutral-700'
      }`}
    >
      {children}
    </Link>
  );
}
