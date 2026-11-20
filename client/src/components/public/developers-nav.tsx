'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const DEVELOPERS_PAGES = [
  { href: '/developers/open-data', label: 'Open data' },
  { href: '/developers/source-code', label: 'Source code' },
  { href: '/developers/documentation', label: 'Documentation' },
] as const;

/** The Developers pages as tabs, styled like LearnNav. */
export function DevelopersNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Developers" className="mt-10">
      <ul className="-mx-4 flex gap-7 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {DEVELOPERS_PAGES.map((p) => {
          const active = pathname === p.href;
          return (
            <li key={p.href} className="shrink-0">
              <Link
                href={p.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 text-sm transition-colors',
                  active
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:border-rule hover:text-ink',
                )}
              >
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
