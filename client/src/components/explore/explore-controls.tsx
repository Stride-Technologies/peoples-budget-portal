'use client';

/**
 * The readout sentence — "Showing [Amount] of [FY2027 AIP] by [Sector] as
 * [Bars]" — plus "Compare with" and the filters sheet (specs/018 US1). Every
 * control rewrites the URL; the server page re-resolves the view, so the
 * chart, the table and the link can never disagree. Native <select>s: they
 * are the most usable picker on a phone and need no library.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLocale, useT } from '@/i18n/locale-provider';
import { localizedPath } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/t';
import { previewView } from '@/app/(public)/explore/_actions';
import { compactPeso } from '@/lib/currency-formatter';
import {
  DIMENSIONS,
  GROUP_BYS,
  encodeView,
  viewHref,
  type Catalogue,
  type Chart,
  type Dimension,
  type ExplorerView,
  type GroupBy,
  type Series,
} from '@/lib/explore/view-url';

const docKey = (s: Pick<Series, 'document'> & { year: number }) => `${s.document}:${s.year}`;

export function ExploreControls({ view, catalogue }: { view: ExplorerView; catalogue: Catalogue }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const s0 = view.series[0];
  const byYear = view.groupBy === 'year';
  const yearsOf = (kind: Series['document']) =>
    catalogue.documents.filter((d) => d.kind === kind).map((d) => d.year).sort((a, b) => a - b);

  const go = (next: ExplorerView) =>
    router.push(localizedPath(locale, viewHref(next)), { scroll: false });

  const withSeries = (series: Series[], over: Partial<ExplorerView> = {}): ExplorerView => ({ ...view, ...over, series });

  const setDocument = (value: string) => {
    const [kind, year] = value.split(':') as [Series['document'], string];
    const years = byYear ? yearsOf(kind) : [Number(year)];
    go(withSeries([{ ...s0, document: kind, years }, ...view.series.slice(1)]));
  };

  const setMeasure = (measure: Series['measure']) => {
    const groupBy: GroupBy = measure === 'count' && (view.groupBy === 'fund' || view.groupBy === 'expenseClass') ? 'sector' : view.groupBy;
    go(withSeries(view.series.map((s) => ({ ...s, measure })), { groupBy }));
  };

  const setGroupBy = (groupBy: GroupBy) => {
    const series = view.series.map((s) => ({
      ...s,
      years: groupBy === 'year' ? yearsOf(s.document) : [Math.max(...s.years)],
    }));
    const chart: Chart = groupBy === 'year' ? (view.chart === 'table' ? 'table' : 'line') : view.chart === 'line' ? 'bar' : view.chart;
    // A theme stack double-counts (R12): fall back to bars.
    go(withSeries(series, { groupBy, chart: (groupBy === 'theme' || groupBy === 'topic') && chart === 'stackedBar' ? 'bar' : chart }));
  };

  const setChart = (chart: Chart) => {
    if (chart === 'line' && !byYear) return setGroupBy('year');
    go({ ...view, chart });
  };

  const setCompare = (value: string) => {
    if (!value) return go(withSeries([s0], { chart: view.chart === 'stackedBar' ? 'bar' : view.chart }));
    const [kind, year] = value.split(':') as [Series['document'], string];
    const years = byYear ? yearsOf(kind) : [Number(year)];
    const next = withSeries([s0, { document: kind, years, measure: s0.measure, filters: s0.filters }]);
    // AIP, LEP and ordinance figures are not the same money: never stacked (R9).
    if (kind !== s0.document && next.chart === 'stackedBar') next.chart = 'bar';
    go(next);
  };

  const filters = s0.filters;
  const filterCount = Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0);
  const setFilters = (next: Series['filters']) => go(withSeries(view.series.map((s) => ({ ...s, filters: next }))));

  const s1 = view.series[1];
  const kinds = new Set(view.series.map((s) => s.document));
  const docOptions = byYear
    ? [...new Set(catalogue.documents.map((d) => d.kind))].filter((k) => yearsOf(k).length >= 2).map((k) => {
        const d = catalogue.documents.find((x) => x.kind === k)!;
        return { value: `${k}:${Math.max(...yearsOf(k))}`, label: d.label.replace(/^FY\d+ /, `FY${Math.min(...yearsOf(k))}–${Math.max(...yearsOf(k))} `) };
      })
    : catalogue.documents.map((d) => ({ value: docKey({ document: d.kind, year: d.year }), label: d.label }));

  const select = 'min-h-11 rounded-md border border-rule bg-paper-raised px-2 py-1 text-sm font-medium text-ink';
  const label = (k: MessageKey) => <span className="text-sm text-ink-faint">{t(k)}</span>;

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-2 leading-relaxed">
        {label('explore.showing')}
        <select aria-label={t('explore.showing')} className={select} value={s0.measure} onChange={(e) => setMeasure(e.target.value as Series['measure'])}>
          <option value="money">{t('explore.measure.money')}</option>
          <option value="count">{t('explore.measure.count')}</option>
        </select>
        {label('explore.of')}
        <select aria-label={t('explore.of')} className={select} value={docKey({ document: s0.document, year: Math.max(...s0.years) })} onChange={(e) => setDocument(e.target.value)}>
          {docOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {label('explore.by')}
        <select aria-label={t('explore.by')} className={select} value={view.groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          {/* A breakdown with no values in the data would draw one "Not specified" bar. */}
          {GROUP_BYS.filter((g) => g === 'year' || g === view.groupBy || catalogue.dimensions[g].length > 0).map((g) => (
            <option
              key={g}
              value={g}
              disabled={
                (s0.measure === 'count' && (g === 'fund' || g === 'expenseClass')) ||
                (g === 'year' && view.series.some((s) => yearsOf(s.document).length < 2))
              }
            >
              {t(`explore.dim.${g}` as MessageKey)}
            </option>
          ))}
        </select>
        {label('explore.as')}
        <select aria-label={t('explore.as')} className={select} value={view.chart} onChange={(e) => setChart(e.target.value as Chart)}>
          <option value="bar">{t('explore.chart.bar')}</option>
          <option value="stackedBar" disabled={view.series.length < 2 || kinds.size > 1 || view.groupBy === 'theme' || view.groupBy === 'topic'}>
            {t('explore.chart.stackedBar')}
          </option>
          <option value="line" disabled={view.series.some((s) => yearsOf(s.document).length < 2)}>{t('explore.chart.line')}</option>
          <option value="table">{t('explore.chart.table')}</option>
        </select>
      </p>

      <p className="flex flex-wrap items-center gap-2">
        {label('explore.compare')}
        <select aria-label={t('explore.compare')} className={select} value={s1 ? docKey({ document: s1.document, year: Math.max(...s1.years) }) : ''} onChange={(e) => setCompare(e.target.value)}>
          <option value="">{t('explore.compareNone')}</option>
          {docOptions
            .filter((o) => o.value !== docKey({ document: s0.document, year: Math.max(...s0.years) }))
            .map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
        <button type="button" onClick={() => setSheetOpen(true)} className={`${select} ml-auto px-3`}>
          {filterCount ? t('explore.filtersCount', { n: filterCount }) : t('explore.filters')}
        </button>
      </p>

      {filterCount > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('explore.filters')}>
          {(Object.entries(filters) as [Dimension, string[]][]).flatMap(([dim, vals]) =>
            vals.map((v) => {
              const name = catalogue.dimensions[dim].find((x) => x.id === v)?.label ?? v;
              return (
                <li key={`${dim}:${v}`}>
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, [dim]: vals.filter((x) => x !== v) })}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-3 text-sm text-ink"
                    aria-label={t('explore.removeFilter', { value: name })}
                  >
                    <span className="text-ink-faint">{t(`explore.dim.${dim}` as MessageKey)}:</span> {name}
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            }),
          )}
        </ul>
      )}

      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        catalogue={catalogue}
        initial={filters}
        onApply={setFilters}
        preview={(f) => encodeView(withSeries(view.series.map((s) => ({ ...s, filters: f })))).toString()}
      />
    </div>
  );
}

function FiltersSheet({
  open,
  onOpenChange,
  catalogue,
  initial,
  onApply,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: Catalogue;
  initial: Series['filters'];
  onApply: (f: Series['filters']) => void;
  /** The view's URL query with these filters, for the live count. */
  preview: (f: Series['filters']) => string;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Series['filters']>(initial);
  const [count, setCount] = useState<Awaited<ReturnType<typeof previewView>>>(null);
  const draftQuery = preview(Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.length)) as Series['filters']);
  // A tap re-counts after a pause, so a run of taps is one request, and a late
  // answer for an older draft never overwrites a newer one.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const id = setTimeout(() => void previewView(draftQuery).then((c) => live && setCount(c)), 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [open, draftQuery]);
  const [query, setQuery] = useState<Partial<Record<Dimension, string>>>({});
  const toggle = (dim: Dimension, id: string) =>
    setDraft((d) => {
      const cur = d[dim] ?? [];
      return { ...d, [dim]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  const dims = useMemo(() => DIMENSIONS.filter((d) => catalogue.dimensions[d].length > 0), [catalogue]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(initial);
        onOpenChange(o);
      }}
    >
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper p-0">
        <SheetHeader className="border-b border-rule px-5 pb-3 pt-5">
          <SheetTitle className="text-base font-semibold">{t('explore.filtersTitle')}</SheetTitle>
        </SheetHeader>
        <div className="divide-y divide-rule px-5">
          {dims.map((dim) => {
            const q = (query[dim] ?? '').toLowerCase();
            const values = catalogue.dimensions[dim].filter((v) => !q || `${v.label} ${v.sublabel ?? ''} ${v.id}`.toLowerCase().includes(q));
            const chosen = draft[dim]?.length ?? 0;
            return (
              <details key={dim} className="py-3" open={chosen > 0}>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium text-ink">
                  {t(`explore.dim.${dim}` as MessageKey)}
                  {chosen > 0 && <span className="font-mono text-xs text-ink-faint">{chosen}</span>}
                </summary>
                {catalogue.dimensions[dim].length > 10 && (
                  <input
                    type="search"
                    value={query[dim] ?? ''}
                    onChange={(e) => setQuery((x) => ({ ...x, [dim]: e.target.value }))}
                    placeholder={t('explore.search', { dimension: t(`explore.dim.${dim}` as MessageKey).toLowerCase() })}
                    className="mb-2 min-h-11 w-full rounded-md border border-rule bg-paper-raised px-3 text-sm"
                  />
                )}
                <ul className="flex flex-wrap gap-2">
                  {values.map((v) => {
                    const on = draft[dim]?.includes(v.id) ?? false;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(dim, v.id)}
                          title={v.sublabel}
                          className={`min-h-11 rounded-full border px-3 text-sm ${on ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper-raised text-ink'}`}
                        >
                          {on && <span aria-hidden="true">✓ </span>}
                          {v.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
        <div className="sticky bottom-0 flex gap-3 border-t border-rule bg-paper px-5 py-4">
          <button type="button" onClick={() => setDraft({})} className="min-h-11 flex-1 rounded-md border border-rule px-4 text-sm text-ink">
            {t('explore.clearAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.length)) as Series['filters']);
              onOpenChange(false);
            }}
            className="min-h-11 flex-1 rounded-md bg-ink px-4 text-sm font-medium text-paper"
          >
            <span aria-live="polite">
              {count === null
                ? t('explore.apply')
                : count.measure === 'money' && count.total !== null
                  ? t('explore.applyCount', { n: count.n.toLocaleString('en-PH'), total: compactPeso(count.total) })
                  : t('explore.applyCountOnly', { n: count.n.toLocaleString('en-PH') })}
            </span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
