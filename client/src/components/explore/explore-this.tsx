import { LocaleLink } from '@/components/i18n/locale-link';
import { getT } from '@/i18n/server';
import { apiExploreCatalogue } from '@/lib/api';
import { EXPLORER_ENABLED, viewHref, type DocumentKind, type GroupBy } from '@/lib/explore/view-url';

/**
 * "Explore this" under an Overview table (specs/018 T017): the same figures as
 * an explorer view the reader can then change. Shown only when the explorer is
 * on and has that year (it has published data) — otherwise the link would
 * land on the explorer's "could not be shown" notice.
 */
export async function ExploreThis({ document, year, by }: { document: DocumentKind; year: number; by: GroupBy }) {
  if (!EXPLORER_ENABLED) return null;
  const catalogue = await apiExploreCatalogue().catch(() => null);
  if (!catalogue?.documents.some((d) => d.kind === document && d.year === year)) return null;
  const t = await getT();
  const href = viewHref({ v: 1, series: [{ document, years: [year], measure: 'money', filters: {} }], groupBy: by, chart: 'bar' });
  return (
    <p className="mt-3 text-right text-sm">
      <LocaleLink href={href} className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
        {t('explore.this')} <span aria-hidden="true">→</span>
      </LocaleLink>
    </p>
  );
}
