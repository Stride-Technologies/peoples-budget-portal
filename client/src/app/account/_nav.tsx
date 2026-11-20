'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound, ShieldCheck, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Profile', href: '/account/profile', icon: UserRound },
  { label: 'Security', href: '/account/security', icon: ShieldCheck },
  { label: 'Activity', href: '/account/activity', icon: History },
];

function NavItemLink({
  label,
  href,
  icon: Icon,
  active,
  compact,
}: {
  label: string;
  href: string;
  icon: React.ElementType;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        compact ? 'px-3 py-1.5' : 'px-3 py-2',
        active
          ? 'bg-blue-600 text-white'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

export function AccountSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-neutral-200 bg-white min-h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-neutral-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Account
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItemLink
            key={item.href}
            {...item}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </nav>
    </aside>
  );
}

export function AccountMobileNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden border-b border-neutral-200 bg-white px-4">
      <div className="flex overflow-x-auto gap-1 py-2 scrollbar-none">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <NavItemLink key={item.href} {...item} active={active} compact />;
        })}
      </div>
    </div>
  );
}
