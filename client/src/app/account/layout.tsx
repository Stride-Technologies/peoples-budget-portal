import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AccountSidebar, AccountMobileNav } from './_nav';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <AccountSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AccountMobileNav />
        <main className="flex-1 p-6 bg-neutral-50">{children}</main>
      </div>
    </div>
  );
}
