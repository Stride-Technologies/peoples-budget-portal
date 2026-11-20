import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetFeedbackCount } from '@/lib/api';
import { ControlPanelSidebar, ControlPanelMobileNav } from './_nav';

export default async function ControlPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { role } = session.user;
  if (role !== 'SUPER_ADMIN' && role !== 'HEAD') redirect('/dashboard');

  const feedbackCount = await apiGetFeedbackCount(session.accessToken).catch(() => ({
    general: 0,
    program: 0,
    total: 0,
  }));

  return (
    <div className="flex min-h-screen">
      <ControlPanelSidebar unreviewedFeedback={feedbackCount.total} />
      <div className="flex-1 flex flex-col min-w-0">
        <ControlPanelMobileNav unreviewedFeedback={feedbackCount.total} />
        <main className="flex-1 p-6 bg-neutral-50">{children}</main>
      </div>
    </div>
  );
}
