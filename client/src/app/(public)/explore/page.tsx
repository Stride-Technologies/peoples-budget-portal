import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { BarChart, LineChart, StackedBarChart } from '@/components/explore/charts';
import { AskBox } from '@/components/explore/ask-box';
import { ExploreCards } from '@/components/explore/explore-cards';
import { ExplainPanel } from '@/components/explore/explain-panel';
import { ExploreControls } from '@/components/explore/explore-controls';
import { ExploreTable } from '@/components/explore/explore-table';
import { ShareMenu } from '@/components/explore/share-menu';
import { getLocale, getT, localeAlternates } from '@/i18n/server';
import type { MessageKey } from '@/i18n/t';
import { apiExploreCapabilities, apiExploreCatalogue, apiExploreDefault, apiExploreSources, apiExploreView } from '@/lib/api';
import { WorkspaceGate } from '@/components/explore/workspace/workspace-gate';
import { spokenPeso } from '@/lib/currency-formatter';
import { joinRows, toCsv } from '@/lib/explore/chart-data';
import { explain } from '@/lib/explore/explain';
import { EXPLORER_ENABLED, decodeView, encodeView, type ResolvedView } from '@/lib/explore/view-url';
import { OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const toQuery = (sp: Record<string, string | string[] | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  return q;
};

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const title = t('explore.meta.title');
  const description = t('explore.meta.description');
  // A shared view previews its own chart (T016); the bare page keeps the site image.
  const view = decodeView(toQuery(sp));
  const images = view
    ? [{ url: `/api/explore/og?${encodeView(view).toString()}`, width: 1200, height: 630, alt: title }]
    : OG_IMAGES;
  return {
    title,
    description,
    alternates: await localeAlternates('/explore'),
    openGraph: { images, title, description },
  };
}

/** The title a chart is known by: what, of which document, by what. */
function titleOf(r: ResolvedView, t: Awaited<ReturnType<typeof getT>>) {
  const by = t(`explore.dim.${r.view.groupBy}` as MessageKey).toLowerCase();
  return `${r.series.map((s) => s.label).join(' vs ')}, by ${by}`;
}

/**
 * The Data Explorer (specs/018). Everything is resolved on the server from
 * the URL: the controls only rewrite the URL, so the chart, the table, the
 * export and the link are one object and cannot disagree.
 */
export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  if (!EXPLORER_ENABLED) notFound();
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const query = toQuery(sp);

  let catalogue;
  let resolved: ResolvedView;
  let invalid = false;
  try {
    catalogue = await apiExploreCatalogue();
    // Nothing published yet in any year: say so, rather than "try again later".
    if (catalogue.documents.length === 0) throw new Error('explore.noYears');
    if (query.has('s')) {
      try {
        resolved = await apiExploreView(query);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status !== 400 && status !== 404) throw e;
        invalid = true;
        resolved = await apiExploreDefault();
      }
    } else resolved = await apiExploreDefault();
  } catch (e) {
    const noYears = (e as Error).message === 'explore.noYears';
    return (
      <EditorialPage>
        <div className="mx-auto max-w-3xl px-4 py-16 text-ink">{t(noYears ? 'explore.noYears' : 'explore.unavailable')}</div>
      </EditorialPage>
    );
  }

  // The mic only where the speech service hears the page's language (design §6).
  const [caps, sources] = await Promise.all([
    apiExploreCapabilities().catch(() => null),
    apiExploreSources().then((r) => r.sources).catch(() => null),
  ]);
  const mic = !!caps?.stt.enabled && caps.stt.languages.includes(locale);
  const lines = joinRows(resolved.series, (n) => t('explore.other', { n }));
  const title = titleOf(resolved, t);
  const docs = [...new Set(resolved.series.map((s) => s.label.split(' · ').pop()))].join('; ');
  const source = t('explore.source', { documents: docs });
  const heading = t(`explore.dim.${resolved.view.groupBy}` as MessageKey);
  const chartProps = { id: 'explore-chart', title, source, series: resolved.series, lines };
  const chart =
    resolved.view.chart === 'line' ? <LineChart {...chartProps} />
    : resolved.view.chart === 'stackedBar' ? <StackedBarChart {...chartProps} />
    : resolved.view.chart === 'bar' ? <BarChart {...chartProps} />
    : null;
  const empty = resolved.series.every((s) => s.n === 0);
  // Read out by screen readers when a control changes the view; a page's first render is not announced.
  const totals = resolved.series
    .map((s) => {
      // A by-year series has no total; announce its latest year instead.
      const last = s.rows.at(-1);
      const figure = s.total ?? last?.value ?? '0';
      const said = s.measure === 'count' ? t('explore.programs', { n: Number(figure) }) : spokenPeso(figure);
      const amount = s.total === null && last ? `${last.label} ${said}` : said;
      return resolved.series.length > 1 ? `${s.label}: ${amount}` : amount;
    })
    .join('; ');
  const announcement = empty ? t('explore.empty') : t(resolved.series.some((s) => s.total === null) ? 'explore.announceLatest' : 'explore.announce', { title, totals });
  const fileBase = `${(await getBrand()).slug}-budget-${resolved.series.map((s) => `${s.document}-${s.years.join('-')}`).join('_')}-by-${resolved.view.groupBy}`;

  return (
    <EditorialPage>
      {/* Desktop: the workspace (redesign P3/P4); below 1024 px, this page (W19). */}
      {sources && <WorkspaceGate catalogue={catalogue} sources={sources} capabilities={caps} />}
      <div className={`mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8${sources ? ' lg:hidden' : ''}`}>
        <header className="space-y-3">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">{t('explore.kicker')}</p>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl">{t('explore.title')}</h1>
          <p className="max-w-2xl text-base text-ink/80">{t('explore.lede')}</p>
        </header>

        {invalid && (
          <p role="status" className="rounded-md border border-rule bg-paper-tint px-4 py-3 text-sm text-ink">
            {t('explore.invalid')}
          </p>
        )}

        <AskBox micSeconds={mic ? caps!.stt.maxSeconds : undefined} training={!!caps?.trainingCapture} />

        <ExploreControls view={resolved.view} catalogue={catalogue} />

        {resolved.notes.length > 0 && (
          <aside aria-label={t('explore.notes')} className="border-l-2 border-ink/40 pl-4 text-sm text-ink/80">
            <ul className="space-y-1">
              {resolved.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </aside>
        )}

        <p role="status" className="sr-only">{announcement}</p>

        {empty ? (
          <p className="text-sm text-ink">{t('explore.empty')}</p>
        ) : (
          <>
            {chart && (
              // On a phone a long ranking reads better as the table below; the drawn chart stays on wider screens.
              <figure className={lines.length > 8 ? 'hidden sm:block' : undefined}>{chart}</figure>
            )}
            <ExplainPanel explanation={explain(resolved.facts, resolved.series)} view={encodeView(resolved.view).toString()} t={t} />
            <ExploreTable
              caption={t('explore.tableCaption', { title })}
              heading={heading}
              totalLabel={t('explore.total')}
              series={resolved.series}
              lines={lines}
            />
          </>
        )}

        <ShareMenu
          svgId={chart ? 'explore-chart' : null}
          fileBase={fileBase}
          csv={toCsv(resolved.series, lines, heading)}
          query={encodeView(resolved.view).toString()}
        />

        <ExploreCards cards={catalogue.cards} locale={locale} heading={t('explore.cards.heading')} />
      </div>
    </EditorialPage>
  );
}
