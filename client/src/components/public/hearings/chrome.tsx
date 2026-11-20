import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { getT } from '@/i18n/server';
import { cn } from '@/lib/utils';

const TAB = 'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors';

/** The paper column every `/hearings` page sits in. */
export function HearingsPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="bg-paper font-sans text-ink">
      <div className={cn('mx-auto w-full px-5 py-10 sm:px-8 sm:py-14', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</div>
    </div>
  );
}

export interface NavBody {
  id: string;
  name?: string;
}

/** Sessions (one tab per body when there is more than one) · Issues · Councilors. */
export async function HearingsNav({ active, bodies = [] }: { active: string; bodies?: NavBody[] }) {
  const t = await getT();
  const sessions =
    bodies.length > 1
      ? bodies.map((b, i) => ({
          id: `body:${b.id}`,
          href: i === 0 ? '/hearings' : `/hearings?body=${encodeURIComponent(b.id)}`,
          label: b.name ?? (i === 0 ? t('hearings.nav.sessions') : b.id.toUpperCase()),
        }))
      : [{ id: `body:${bodies[0]?.id ?? ''}`, href: '/hearings', label: t('hearings.nav.sessions') }];
  const links = [
    ...sessions,
    { id: 'issues', href: '/hearings/issues', label: t('hearings.nav.issues') },
    { id: 'councilors', href: '/hearings/councilors', label: t('hearings.nav.councilors') },
  ];
  return (
    <nav aria-label={t('hearings.nav.label')} className="mb-10 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.id}
          href={l.href}
          aria-current={l.id === active ? 'page' : undefined}
          className={cn(
            TAB,
            l.id === active
              ? 'border-ink bg-ink text-paper'
              : 'border-rule bg-paper-raised text-ink-muted hover:border-ink hover:text-ink',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
