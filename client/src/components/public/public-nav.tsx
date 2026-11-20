'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISIONS } from '@/lib/finish-lines';
import { Seal } from '@/components/brand/seal';
import { useBrand } from '@/components/brand/brand-provider';
import { LocaleLink } from '@/components/i18n/locale-link';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { useT } from '@/i18n/locale-provider';
import { splitLocale } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/t';
import { EXPLORER_ENABLED } from '@/lib/explore/view-url';
import { HEARINGS_ENABLED } from '@/lib/hearings/config';

// /budget is deliberately absent. It is still a live route — the parent of every
// /budget/<programId> deep link, and where /registry and the old
// /aip/<programId> links land — but with both sections in the nav it would be a
// third entry onto overlapping tables. One obvious path in beats three.
//
// Any href added here must also be added to the footer's "The Portal" list in
// `(public)/layout.tsx`, and to `publicPages` in `layout/navbar.tsx`.
const NAV_LINKS: { label: MessageKey; href: string }[] = [
  { label: 'nav.home', href: '/' },
  { label: 'nav.aip', href: '/aip' },
  { label: 'nav.annual', href: '/annual' },
  { label: 'nav.ppmp', href: '/ppmp' },
  // specs/018, behind NEXT_PUBLIC_EXPLORER_ENABLED.
  ...(EXPLORER_ENABLED ? [{ label: 'nav.explore' as MessageKey, href: '/explore' }] : []),
  // Only where a hearings API is configured (docs/modules/hearings.md).
  ...(HEARINGS_ENABLED ? [{ label: 'nav.hearings' as MessageKey, href: '/hearings' }] : []),
  { label: 'nav.learn', href: '/learn' },
  { label: 'nav.developers', href: '/developers' },
];

export function PublicNav() {
  // The page's own path, without a /fil or /bcl prefix (specs/014).
  const pathname = splitLocale(usePathname()).path;
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const brand = useBrand();
  const links = NAV_LINKS;

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      {/* The eight finish-line colours as the site's top rule. The old gradient
          was three arbitrary brand tints; this is the city's own palette, and it
          is the same set a reader meets in every chart. */}
      <div aria-hidden="true" className="flex h-1">
        {VISIONS.map((v) => (
          <span key={v.id} className="flex-1" style={{ backgroundColor: v.color }} />
        ))}
      </div>

      <div className="mx-auto flex max-w-7xl items-stretch gap-4 border-b border-rule px-4 sm:px-6 lg:px-8">
        <LocaleLink href="/" className="flex shrink-0 items-center gap-3 py-3">
          <Seal priority className="h-10 w-10" />
          <span className="hidden sm:block">
            <span className="block font-mono text-[0.5625rem] uppercase leading-none tracking-[0.16em] text-ink-faint">
              {brand.government}
            </span>
            <span className="mt-1 block font-display text-[1.375rem] font-medium leading-none tracking-[-0.02em] text-ink">
              People&rsquo;s Budget Portal
            </span>
          </span>
          <span className="font-display text-lg font-medium leading-tight tracking-[-0.02em] text-ink sm:hidden">
            People&rsquo;s Budget Portal
          </span>
        </LocaleLink>

        <nav aria-label="Main" className="ml-auto hidden md:flex">
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <LocaleLink
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center px-3 text-sm transition-colors',
                  active
                    ? 'font-medium text-ink'
                    : 'text-ink-muted hover:bg-paper-tint hover:text-ink',
                )}
              >
                {t(link.label)}
                {/* Full-height tab: hover tints the whole cell and shows the
                    same bottom bar as the active tab, a shade lighter. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 -bottom-px h-[2px] transition-colors',
                    active ? 'bg-ink' : 'bg-transparent group-hover:bg-ink-faint',
                  )}
                />
              </LocaleLink>
            );
          })}
        </nav>

        <LanguageSwitcher className="hidden self-center border-l border-rule pl-3 md:flex" />

        <button
          className="ml-auto self-center rounded-md p-1.5 text-ink-muted hover:bg-paper-tint md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-b border-rule bg-paper px-4 pb-4 pt-2 md:hidden">
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <LocaleLink
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block rounded-md px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-paper-deep font-medium text-ink'
                    : 'text-ink-muted hover:bg-paper-tint hover:text-ink',
                )}
              >
                {t(link.label)}
              </LocaleLink>
            );
          })}
          <LanguageSwitcher className="mt-3 px-3" />
        </div>
      )}
    </header>
  );
}
