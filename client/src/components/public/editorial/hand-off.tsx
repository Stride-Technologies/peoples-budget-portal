import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { getT } from '@/i18n/server';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { METHODOLOGY_PUBLIC, sectionHref, type PublicSection } from '@/lib/public-sections';

/**
 * The last section: where the argument stops and the reader's own work starts.
 *
 * Three destinations, each with the reason to go there rather than its name
 * repeated. "Browse" tells a visitor nothing; "every entry, searchable, down to
 * the centavo" tells them whether it is what they want.
 */
// Columns by card count, so two or three cards never leave an empty cell.
const HAND_OFF_COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export async function HandOff({
  kind,
  year,
  programCount,
  noun,
  also,
}: {
  kind: PublicSection;
  year: number;
  programCount: number;
  /** What Browse lists, plural — "entries" by default, or "plans" on the PPMP section. Already translated. */
  noun?: string;
  /** A fourth destination, e.g. the same year's budget from the PPMP section. */
  also?: { href: string; label: string; gloss: string };
}) {
  const t = await getT();
  const links = [
    {
      href: sectionHref(kind, year, 'browse'),
      label: t('handoff.browse'),
      gloss: t('handoff.browseGloss', {
        count: programCount.toLocaleString('en-PH'),
        noun: noun ?? t('handoff.noun.entries'),
      }),
    },
    ...(METHODOLOGY_PUBLIC
      ? [
          {
            href: sectionHref(kind, year, 'methodology'),
            label: t('handoff.methodology'),
            gloss: t('handoff.methodologyGloss'),
          },
        ]
      : []),
    {
      href: '/learn',
      label: t('handoff.learn'),
      gloss: t('handoff.learnGloss'),
    },
    ...(also ? [also] : []),
  ];

  return (
    <section
      aria-labelledby="hand-off-claim"
      className="border-t border-rule py-16 sm:py-24"
    >
      {/* Owns its gutter. It used to inherit one from a wrapper on the overview
          page; when that wrapper went with the snapping, this section's text ran
          to the viewport edge. A section that can be dropped anywhere has to
          carry its own margins. */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div data-reveal>
        <p
          aria-hidden="true"
          className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint"
        >
          {t('handoff.eyebrow')}
        </p>
        <h2
          id="hand-off-claim"
          className="mt-5 max-w-[36rem] font-display text-[clamp(1.75rem,1.1rem+2.6vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink"
        >
          {t('handoff.title')}
        </h2>
      </div>

      <ul className={cn("mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule", HAND_OFF_COLS[links.length])}>
        {links.map((link) => (
          <li key={link.href} className="bg-paper-raised">
            <Link
              href={link.href}
              className="group flex h-full flex-col justify-between gap-6 p-6 transition-colors hover:bg-paper focus-visible:bg-paper sm:p-7"
            >
              <span className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
                {link.label}
              </span>
              <span className="flex items-end justify-between gap-4">
                <span className="text-sm leading-6 text-ink-muted">{link.gloss}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="mb-1 size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
