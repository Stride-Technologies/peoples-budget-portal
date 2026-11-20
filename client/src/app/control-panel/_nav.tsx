'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Layers,
  Flag,
  CalendarRange,
  Users2,
  LayoutGrid,
  Building2,
  FileCode2,
  Leaf,
  ShieldCheck,
  Globe,
  MessageSquare,
  History,
  Tag,
  MessageCircleQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXPLORER_ENABLED } from '@/lib/explore/view-url';
import { GOALS } from '@/lib/goal-label';


interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const navGroups = (unreviewedFeedback: number): { label: string; items: NavItem[] }[] => [
  {
    label: 'AIP',
    items: [
      { label: 'AIP Cycles', href: '/control-panel/aip-cycles', icon: CalendarRange },
      { label: 'Public Feedback', href: '/dashboard/feedback', icon: MessageSquare, badge: unreviewedFeedback },
      { label: 'Edit History', href: '/control-panel/edit-history', icon: History },
      ...(EXPLORER_ENABLED
        ? [{ label: 'Explorer Questions', href: '/control-panel/explorer-log', icon: MessageCircleQuestion }]
        : []),
    ],
  },
  {
    label: 'People',
    items: [{ label: 'Users', href: '/control-panel/users', icon: Users }],
  },
  {
    label: 'Reference',
    items: [
      { label: 'Offices', href: '/control-panel/offices', icon: Building2 },
      { label: 'Clusters', href: '/control-panel/clusters', icon: Layers },
      { label: GOALS, href: '/control-panel/finish-lines', icon: Flag },
      { label: 'Civil Society Orgs', href: '/control-panel/civil-society-organizations', icon: Users2 },
      { label: 'PAP Sectors', href: '/control-panel/pap-sectors', icon: LayoutGrid },
      { label: 'UACS Objects', href: '/control-panel/uacs-objects', icon: FileCode2 },
      { label: 'Climate Codes', href: '/control-panel/climate-typology-codes', icon: Leaf },
      { label: 'SGLG Indicators', href: '/control-panel/sglg-indicators', icon: ShieldCheck },
      { label: 'SDG Goals', href: '/control-panel/sdg-goals', icon: Globe },
      { label: 'Thematic Tags', href: '/control-panel/thematic-tags', icon: Tag },
    ],
  },
];

function NavItemLink({
  label,
  href,
  icon: Icon,
  badge,
  active,
  compact,
}: {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
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
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            'ml-auto inline-flex items-center justify-center rounded-full text-xs font-medium min-w-5 h-5 px-1',
            active ? 'bg-white text-blue-600' : 'bg-blue-600 text-white',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export function ControlPanelSidebar({ unreviewedFeedback = 0 }: { unreviewedFeedback?: number }) {
  const pathname = usePathname();
  const groups = navGroups(unreviewedFeedback);

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-neutral-200 bg-white min-h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-neutral-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Control Panel
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  {...item}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function ControlPanelMobileNav({ unreviewedFeedback = 0 }: { unreviewedFeedback?: number }) {
  const pathname = usePathname();
  const groups = navGroups(unreviewedFeedback);

  return (
    <div className="md:hidden border-b border-neutral-200 bg-white px-4">
      <div className="flex overflow-x-auto gap-1 py-2 scrollbar-none">
        {groups.flatMap((g) => g.items).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <NavItemLink key={item.href} {...item} active={active} compact />
          );
        })}
      </div>
    </div>
  );
}
