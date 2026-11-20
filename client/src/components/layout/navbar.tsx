'use client';

import { EXPLORER_ENABLED } from '@/lib/explore/view-url';
import { HEARINGS_ENABLED } from '@/lib/hearings/config';
import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { splitLocale } from '@/i18n/locales';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  Menu,
  User,
  LayoutDashboard,
  Settings,
  Building2,
  IdCard,
  Layers,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/session';
import type { ProponentContext } from '@/lib/proponent';
import { logoutAction } from '@/app/actions/auth';
import { Seal } from '@/components/brand/seal';
import { useBrand } from '@/components/brand/brand-provider';
import { isProtectedRoute } from '@/lib/protected-routes';
import { GOALS } from '@/lib/goal-label';


const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'AIP Registry', href: '/aip-registry' },
  { label: 'Public Feedback', href: '/dashboard/feedback' },
  { label: GOALS, href: '/finish-lines' },
  { label: 'PPMP Registry', href: '/ppmp-registry' },
  { label: 'Budget Documents', href: '/budget-cycles', permission: 'budget:read' },
];

// Public-facing portal pages, surfaced for quick access from the admin nav.
// Mirrors NAV_LINKS in `public/public-nav.tsx` — a staff member following these
// should land where a visitor lands. `/aip` is the public section here, *not*
// the authenticated `/aip-registry` in `navItems` above; labelling it "AIP
// Registry" would put that name on two different hrefs in one nav.
const publicPages = [
  { label: 'Home', href: '/' },
  { label: 'AIP', href: '/aip' },
  { label: 'Annual Budget', href: '/annual' },
  { label: 'PPMP', href: '/ppmp' },
  ...(EXPLORER_ENABLED ? [{ label: 'Explore', href: '/explore' }] : []),
  ...(HEARINGS_ENABLED ? [{ label: 'Hearings', href: '/hearings' }] : []),
  { label: 'Learn', href: '/learn' },
  { label: 'Developers', href: '/developers' },
  // Absent from the visitor nav on purpose, but kept here: it is still the
  // parent of every /budget/<programId> deep link.
  { label: 'Budget', href: '/budget' },
];

const adminMenuItems = [
  { label: 'Account', href: '/account', icon: User },
  { label: 'Control Panel', href: '/control-panel', icon: LayoutDashboard },
];

const staffMenuItems = [
  { label: 'Account', href: '/account', icon: User },
];

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function Navbar({
  user,
  proponentContext,
  fiscalYear,
}: {
  user: SessionUser;
  proponentContext?: ProponentContext | null;
  fiscalYear?: number | null;
}) {
  const aipLabel = fiscalYear
    ? `Annual Investment Program · FY ${fiscalYear}`
    : 'Annual Investment Program';
  const pathname = usePathname();
  const brand = useBrand();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const matchesNav = (href: string) => {
    if (href === '/aip-registry') {
      return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith('/programs/');
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isNavActive = (href: string) => {
    if (!matchesNav(href)) return false;
    // A more specific entry wins, so /dashboard does not also light up while
    // you are on /dashboard/feedback — which now has its own nav item.
    return !navItems.some(
      (item) => item.href !== href && item.href.startsWith(href) && matchesNav(item.href),
    );
  };

  const isPublicActive =
    pathname === '/' ||
    (pathname === '/budget' || pathname.startsWith('/budget/'));

  const fullName = `${user.firstName} ${user.lastName}`;
  const initials = getInitials(user.firstName, user.lastName);
  const menuItems = user.role === 'SUPER_ADMIN' || user.role === 'HEAD' ? adminMenuItems : staffMenuItems;
  // Mirrors hasPermission() in lib/session (server-only): SUPER_ADMIN bypasses.
  const allowed = ({ permission }: { permission?: string }) =>
    !permission ||
    user.role === 'SUPER_ADMIN' ||
    (user.permissions?.includes(permission) ?? false);
  const shownNavItems = navItems.filter(allowed);
  const shownPublicPages = publicPages;
  const hasProponentDetails = Boolean(
    proponentContext &&
      (proponentContext.organizationName || proponentContext.clusterName)
  );

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="flex items-center justify-between h-16 px-6">
        {/* LEFT SECTION: Logo & App Title */}
        <Link href="/dashboard" className="flex items-center gap-4 min-w-fit hover:opacity-80 transition-opacity">
          {/* The city's own seal, not a coloured monogram tile. It is a detailed
              circular emblem, so it sits on the page rather than inside a filled
              square, and `priority` keeps it out of the lazy queue — it is in the
              header of every authenticated page. */}
          <Seal priority className="h-10 w-10" />
          <div className="hidden sm:flex flex-col">
            <h1 className="text-sm font-semibold text-neutral-900">
              {brand.staffAppName}
            </h1>
            <p className="text-xs text-neutral-500">
              {aipLabel}
            </p>
          </div>
        </Link>

        {/* CENTER SECTION: Navigation Links */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {shownNavItems.map((item) => {
            const isActive = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                )}
              >
                {item.label}
              </Link>
            );
          })}

          {/* On a public page a signed-in visitor gets the same language switcher (specs/014 FR-005). */}
          {!isProtectedRoute(splitLocale(pathname).path) && <LanguageSwitcher className="px-2" />}

          {/* Public Pages quick-access dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Public pages"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=open]:bg-neutral-100',
                isPublicActive
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50',
              )}
            >
              <Globe className="h-4 w-4" />
              Public Pages
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-normal text-neutral-400">
                  Public Pages
                </DropdownMenuLabel>
                {shownPublicPages.map(({ label, href }) => (
                  <DropdownMenuItem key={href} onClick={() => router.push(href)}>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* RIGHT SECTION: User Info & Avatar Menu */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="hidden sm:flex flex-col items-end min-w-0">
            <p className="text-sm font-medium text-neutral-900">{fullName}</p>
            <p className="text-xs text-neutral-500 truncate">
              {[
                // Acronyms read as themselves (LGU, NCPC, LFC); DEVELOPER is a word.
                proponentContext?.identityType === 'DEVELOPER'
                  ? 'Developer'
                  : proponentContext?.identityType,
                // Acronym, not the full office name — "Office of the City
                // Planning and Development Coordinator" pushes this line wider
                // than the user's own name. The dropdown still shows it in full.
                proponentContext?.organizationAcronym ??
                  proponentContext?.organizationName,
                formatRole(user.role),
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              aria-label="Open user menu"
            >
              <Avatar className="w-10 h-10 cursor-pointer">
                <AvatarFallback className="bg-blue-600 text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="pb-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{fullName}</p>
                  <p className="text-xs font-normal text-neutral-500">{formatRole(user.role)}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {menuItems.map(({ label, href, icon: Icon }) => (
                  <DropdownMenuItem key={href} onClick={() => router.push(href)}>
                    <Icon className="mr-2 h-4 w-4" />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleLogout}
                disabled={isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {isPending ? 'Signing out…' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(true)}
            className="md:hidden ml-1 p-2 hover:bg-neutral-100 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-neutral-900" />
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="w-64 flex flex-col">
          <SheetHeader className="mb-6 border-b pb-4">
            <SheetTitle className="text-left text-base">{brand.staffAppName}</SheetTitle>
            <p className="text-left text-xs text-neutral-500">{aipLabel}</p>
          </SheetHeader>
          <nav className="flex flex-col gap-2 flex-1">
            {shownNavItems.map((item) => {
              const isActive = isNavActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Public Pages */}
            <div className="mt-3 border-t pt-3">
              <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Public Pages
              </p>
              <div className="flex flex-col gap-2">
                {shownPublicPages.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    <Globe className="h-4 w-4 text-neutral-400" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-3 px-1 mb-3">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="bg-blue-600 text-white font-semibold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{fullName}</p>
                <p className="text-xs text-neutral-500">{formatRole(user.role)}</p>
              </div>
            </div>
            {hasProponentDetails && proponentContext && (
              <div className="mb-3 space-y-1.5 px-1">
                <ProponentItem
                  icon={IdCard}
                  label="Proponent type"
                  value={proponentContext.proponentLabel}
                />
                {proponentContext.organizationName && (
                  <ProponentItem
                    icon={Building2}
                    label="Office / CSO"
                    value={proponentContext.organizationName}
                  />
                )}
                {proponentContext.clusterName && (
                  <ProponentItem
                    icon={Layers}
                    label="Cluster"
                    value={proponentContext.clusterName}
                  />
                )}
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={isPending}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              {isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function ProponentItem({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof Building2;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span className="truncate text-xs font-medium text-neutral-700">
        {value}
      </span>
    </div>
  );
}
