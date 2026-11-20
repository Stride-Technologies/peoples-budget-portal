import { LocaleLink } from '@/components/i18n/locale-link';
import { viewHref, type Card } from '@/lib/explore/view-url';
import type { Locale } from '@/i18n/locales';

/** Curated questions (catalogue cards): each is a ready view, no AI involved. */
export function ExploreCards({ cards, locale, heading }: { cards: Card[]; locale: Locale; heading: string }) {
  const shown = cards.filter((c) => c.tags.includes('default')).slice(0, 6);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="explore-cards">
      <h2 id="explore-cards" className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
        {heading}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.id}>
            <LocaleLink
              href={viewHref(c.view)}
              className="block min-h-11 rounded-md border border-rule bg-paper-raised px-4 py-3 text-sm text-ink transition-colors hover:border-ink/40"
            >
              {c.question[locale] ?? c.question.en}
            </LocaleLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
