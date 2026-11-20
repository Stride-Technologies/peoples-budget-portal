import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetAdminRegistryFeedback, apiGetAdminProgramFeedback } from '@/lib/api';
import FeedbackTable from './feedback-table';
import ProgramFeedbackTable from './program-feedback-table';

export default async function RegistryFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; tab?: string; reviewed?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { category, page, tab, reviewed } = await searchParams;
  const activeTab = tab === 'program' ? 'program' : 'general';
  const pageNum = page ? Math.max(1, Number(page)) : 1;
  const showReviewed = reviewed === 'true';
  const canAct = session.user.role === 'HEAD' || session.user.role === 'SUPER_ADMIN';

  const [generalResult, programResult] = await Promise.all([
    apiGetAdminRegistryFeedback(session.accessToken, {
      category: category || undefined,
      reviewed: showReviewed,
      page: pageNum,
      limit: 50,
    }).catch(() => ({ items: [], total: 0, page: pageNum, limit: 50 })),
    apiGetAdminProgramFeedback(session.accessToken, {
      reviewed: showReviewed,
      page: pageNum,
      limit: 50,
    }).catch(() => ({ items: [], total: 0, page: pageNum, limit: 50 })),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Registry Feedback</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Citizens&apos; feedback submitted via the public AIP registry.
        </p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        <TabLink href={`/control-panel/registry-feedback?tab=general&reviewed=${showReviewed}&page=1`} active={activeTab === 'general'}>
          General
          {!showReviewed && generalResult.total > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-medium w-5 h-5">
              {generalResult.total > 99 ? '99+' : generalResult.total}
            </span>
          )}
        </TabLink>
        <TabLink href={`/control-panel/registry-feedback?tab=program&reviewed=${showReviewed}&page=1`} active={activeTab === 'program'}>
          Program-specific
          {!showReviewed && programResult.total > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-medium w-5 h-5">
              {programResult.total > 99 ? '99+' : programResult.total}
            </span>
          )}
        </TabLink>
      </div>

      {activeTab === 'general' ? (
        <FeedbackTable
          data={generalResult}
          currentCategory={category ?? ''}
          currentPage={pageNum}
          showReviewed={showReviewed}
          canAct={canAct}
          token={session.accessToken}
        />
      ) : (
        <ProgramFeedbackTable
          data={programResult}
          currentPage={pageNum}
          showReviewed={showReviewed}
          canAct={canAct}
          token={session.accessToken}
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
      className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-neutral-500 hover:text-neutral-700'
      }`}
    >
      {children}
    </Link>
  );
}
