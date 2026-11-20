'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  FileText,
  Landmark,
  Layers3,
  Search,
  WalletCards,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/custom/simple-select';
import { getFinishLineTheme, type FinishLine, type FinishLineTheme } from '@/lib/finish-lines';
import { cn } from '@/lib/utils';
import { loadFinishLinesPageData } from './_actions';
import { GOAL, GOALS, goal, goals } from '@/lib/goal-label';


type ViewState = 'ready' | 'loading' | 'empty' | 'error';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-PH');

function formatPeso(value = 0) {
  return pesoFormatter.format(value);
}

function formatCompactPeso(value = 0) {
  if (value >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(1)}M`;
  }

  return formatPeso(value);
}

function getOverview(lines: FinishLine[]) {
  const proponents = new Set(
    lines.flatMap((line) => line.departments ?? [line.responsibleOffice].filter(Boolean))
  );

  return {
    allocation: lines.reduce((total, line) => total + (line.allocation ?? 0), 0),
    finishLines: lines.length,
    ppas: lines.reduce((total, line) => total + (line.ppaCount ?? 0), 0),
    departments: proponents.size,
  };
}

export default function FinishLinesPage() {
  const [selectedYear, setSelectedYear] = useState('');
  const [query, setQuery] = useState('');
  const [pageState, setPageState] = useState<ViewState>('loading');
  const [finishLineData, setFinishLineData] = useState<FinishLine[]>([]);
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setPageState('loading');
      const result = await loadFinishLinesPageData();
      if (cancelled) return;

      if ('error' in result) {
        setPageState('error');
        return;
      }

      setFinishLineData(result.finishLines);
      setYears(result.years);
      setSelectedYear(result.defaultYear);
      setPageState(result.finishLines.length > 0 ? 'ready' : 'empty');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFinishLines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return finishLineData.filter((line) => {
      const matchesYear = !selectedYear || line.fiscalYear === selectedYear;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          line.name,
          line.shortName,
          line.cluster,
          line.category,
          line.code,
          line.responsibleOffice,
          line.description,
          ...(line.departments ?? []),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));

      return matchesYear && matchesQuery;
    }).sort((first, second) => (first.displayNumber ?? 0) - (second.displayNumber ?? 0));
  }, [finishLineData, query, selectedYear]);

  const selectedYearFinishLineCount = useMemo(
    () => finishLineData.filter((line) => !selectedYear || line.fiscalYear === selectedYear).length,
    [finishLineData, selectedYear],
  );

  const overview = useMemo(() => getOverview(filteredFinishLines), [filteredFinishLines]);

  return (
    <div className="min-h-full bg-slate-50/60">
      <PageHeader selectedYear={selectedYear} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <FinishLinesControls
          selectedYear={selectedYear}
          years={years}
          query={query}
          onYearChange={setSelectedYear}
          onQueryChange={setQuery}
        />

        {pageState === 'error' ? (
          <FinishLinesErrorState />
        ) : pageState === 'loading' ? (
          <FinishLinesLoadingState />
        ) : pageState === 'empty' || filteredFinishLines.length === 0 ? (
          <>
            <StrategicOverview overview={overview} />
            <FinishLinesEmptyState />
          </>
        ) : (
          <>
            <StrategicOverview overview={overview} />
            <section className="space-y-4" aria-labelledby="finish-lines-grid-heading">
              <div>
                <h2 id="finish-lines-grid-heading" className="font-heading text-lg font-semibold text-slate-950">
                  {GOALS}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Strategic outcome areas that group programs, projects, and activities under shared governance goals.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {filteredFinishLines.map((line) => (
                  <FinishLineOverviewCard
                    key={line.id}
                    finishLine={line}
                    totalFinishLineCount={selectedYearFinishLineCount}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function PageHeader({
  selectedYear,
}: Readonly<{
  selectedYear: string;
}>) {
  return (
    <section className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Strategic Budget Allocation Clusters
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
              {GOALS}
            </h1>
            <span className="inline-flex h-5 items-center rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-800">
              {selectedYear}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
            Strategic development allocation overview for budgeting and planning.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinishLinesControls({
  selectedYear,
  years,
  query,
  onYearChange,
  onQueryChange,
}: Readonly<{
  selectedYear: string;
  years: string[];
  query: string;
  onYearChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}>) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-950">
            Allocation Register
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Search and filter {goals} by proponent, code, or fiscal year.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={`Search ${goals}, proponents, or codes`}
              aria-label={`Search ${goals}`}
              className="h-10 rounded-md border-slate-300 bg-white pl-9 text-sm"
            />
          </div>
          <SimpleSelect
            aria-label="Fiscal year"
            size="sm"
            className="h-10 font-medium text-slate-800"
            options={years.map((year) => ({ value: year, label: year }))}
            value={selectedYear}
            onChange={onYearChange}
            disabled={years.length === 0}
            placeholder="Fiscal year"
          />
        </div>
      </div>
    </section>
  );
}

function StrategicOverview({ overview }: Readonly<{ overview: ReturnType<typeof getOverview> }>) {
  const items = [
    {
      label: 'Total Allocations',
      value: formatPeso(overview.allocation),
      icon: WalletCards,
    },
    {
      label: `Total ${GOALS}`,
      value: numberFormatter.format(overview.finishLines),
      icon: Layers3,
    },
    {
      label: 'Total PPAs',
      value: numberFormatter.format(overview.ppas),
      icon: FileText,
    },
    {
      label: 'Participating Proponents',
      value: numberFormatter.format(overview.departments),
      icon: Building2,
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="strategic-overview-heading">
      <div>
        <h2 id="strategic-overview-heading" className="font-heading text-lg font-semibold text-slate-950">
          Strategic Overview
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Summary of allocation scale, coverage by {goal}, and proponent participation.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {item.value}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-blue-800">
                <item.icon className="size-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinishLineOverviewCard({
  finishLine,
  totalFinishLineCount,
}: Readonly<{
  finishLine: FinishLine;
  totalFinishLineCount: number;
}>) {
  const theme = getFinishLineTheme(finishLine.displayNumber, totalFinishLineCount);

  return (
    <Card className="group overflow-hidden rounded-lg border-slate-200 bg-white shadow-sm transition-colors duration-150 hover:border-blue-700/30 hover:bg-blue-50/20">
        <div className="flex h-full flex-col">
        <FinishLineCardHeader finishLine={finishLine} totalFinishLineCount={totalFinishLineCount} />
        <AllocationSection finishLine={finishLine} theme={theme} />
        <PpaTracker finishLine={finishLine} />
        <MetadataRow finishLine={finishLine} />
        {finishLine.description ? <OptionalDescription description={finishLine.description} /> : null}
        <FutureAnalyticsSlot />
      </div>
    </Card>
  );
}

function FinishLineCardHeader({
  finishLine,
  totalFinishLineCount,
}: Readonly<{
  finishLine: FinishLine;
  totalFinishLineCount: number;
}>) {
  const theme = getFinishLineTheme(finishLine.displayNumber, totalFinishLineCount);

  return (
    <div className={cn('border-b p-5', theme.header)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          <FinishLineNumberMark number={finishLine.displayNumber ?? 0} theme={theme} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-xs font-semibold uppercase tracking-[0.12em]', theme.label)}>
                {GOAL}
              </p>
            {finishLine.code ? (
              <span className={cn('rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ring-1', theme.code)}>
                {finishLine.code}
              </span>
            ) : null}
          </div>
          <h3 className={cn('mt-2 font-heading text-xl font-semibold leading-7', theme.title)}>
            {finishLine.name}
          </h3>
          <p className={cn('mt-1 text-sm font-medium', theme.category)}>{finishLine.category}</p>
          </div>
        </div>
        <StatusBadge status={finishLine.status ?? 'Active'} className={theme.status} />
      </div>
    </div>
  );
}

function FinishLineNumberMark({
  number,
  theme,
}: Readonly<{
  number: number;
  theme: FinishLineTheme;
}>) {
  return (
    <div className="relative flex h-14 w-12 shrink-0 items-center justify-center" aria-label={`${GOAL} ${number}`}>
      <span className={cn('absolute left-1 top-1 font-heading text-5xl font-bold leading-none', theme.numberShadow)}>
        {number}
      </span>
      <span className={cn('relative font-heading text-5xl font-bold leading-none', theme.number)}>
        {number}
      </span>
    </div>
  );
}

function StatusBadge({ status, className }: Readonly<{ status: NonNullable<FinishLine['status']>; className?: string }>) {
  const statusClassName = {
    Active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Ongoing: 'border-blue-200 bg-blue-50 text-blue-800',
    Planned: 'border-slate-200 bg-slate-50 text-slate-700',
  }[status];

  return (
    <Badge variant="outline" className={cn('h-6 rounded-md px-2.5 font-medium', statusClassName, className)}>
      {status}
    </Badge>
  );
}

function AllocationSection({
  finishLine,
  theme,
}: Readonly<{
  finishLine: FinishLine;
  theme: FinishLineTheme;
}>) {
  return (
    <div className="px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Total Allocation
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {formatPeso(finishLine.allocation)}
      </p>
      <AllocationCeilingTracker finishLine={finishLine} theme={theme} />
    </div>
  );
}

function AllocationCeilingTracker({
  finishLine,
  theme,
}: Readonly<{
  finishLine: FinishLine;
  theme: FinishLineTheme;
}>) {
  // A ₱0 ceiling is a real cap, so "set" is the presence of the row, not a
  // positive amount. Percentages still need `ceiling > 0` to avoid dividing by
  // zero — a zero cap with anything allocated is simply over.
  const hasCeiling = finishLine.ceiling != null;
  const ceiling = finishLine.ceiling ?? 0;
  const allocation = finishLine.allocation ?? 0;
  const utilization = ceiling > 0 ? Math.round((allocation / ceiling) * 100) : hasCeiling && allocation > 0 ? 100 : 0;
  const progress = Math.min(utilization, 100);
  const over = hasCeiling && allocation > ceiling;
  const status = !hasCeiling ? 'No ceiling set' : over ? 'Over ceiling' : utilization >= 85 ? 'Near ceiling' : 'Within ceiling';
  const statusClassName =
    !hasCeiling
      ? 'text-slate-500'
      : over
      ? 'text-red-700'
      : utilization >= 85
        ? 'text-amber-700'
        : 'text-slate-600';

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('size-2 rounded-full', theme.dot)} />
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Ceiling Usage
          </p>
        </div>
        <p className={cn('text-xs font-semibold', statusClassName)}>{status}</p>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">
          {formatCompactPeso(allocation)}
          <span className="font-normal text-slate-500">
            {' / '}
            {hasCeiling ? formatCompactPeso(ceiling) : 'No ceiling'}
          </span>
        </p>
        <p className="text-xs font-medium text-slate-500">{utilization}% used</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn('h-full rounded-full', theme.bar)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function PpaTracker({ finishLine }: Readonly<{ finishLine: FinishLine }>) {
  const items = [
    { label: 'Programs', value: finishLine.programCount ?? 0 },
    { label: 'Projects', value: finishLine.projectCount ?? 0 },
    { label: 'Activities', value: finishLine.activityCount ?? 0 },
  ];

  return (
    <div className="border-t border-slate-100 px-5 pb-5">
      <div className="grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'px-3 py-3 text-center',
              index > 0 && 'border-l border-slate-200'
            )}
          >
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {numberFormatter.format(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetadataRow({ finishLine }: Readonly<{ finishLine: FinishLine }>) {
  const metadata = [
    {
      label: 'PPAs',
      value: numberFormatter.format(finishLine.ppaCount ?? 0),
      icon: FileText,
    },
    {
      label: 'Proponents',
      value: numberFormatter.format(finishLine.departmentCount ?? finishLine.departments?.length ?? 0),
      icon: Building2,
    },
    {
      label: 'Strategic Clusters',
      value: finishLine.responsibleOffice ?? '-',
      icon: Landmark,
    },
    {
      label: 'Fiscal Year',
      value: finishLine.fiscalYear ?? '-',
      icon: CalendarDays,
    },
  ];

  return (
    <div className="grid grid-cols-1 border-y border-slate-100 sm:grid-cols-2">
      {metadata.map((item) => (
        <div key={item.label} className="flex min-w-0 gap-3 border-slate-100 px-5 py-3 odd:sm:border-r">
          <item.icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionalDescription({ description }: Readonly<{ description: string }>) {
  return (
    <div className="px-5 py-4">
      <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function FutureAnalyticsSlot() {
  return (
    <div
      className="hidden"
      data-slot="future-analytics"
      aria-hidden="true"
    />
  );
}

function FinishLinesEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
        <Layers3 className="size-5" />
      </div>
      <h2 className="mt-4 font-heading text-lg font-semibold text-slate-950">
        No {goals} available yet.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        Strategic {goals} will appear here once configured.
      </p>
    </section>
  );
}

function FinishLinesLoadingState() {
  return (
    <div className="space-y-6" aria-label={`Loading ${goals}`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="mt-4 h-7 w-36 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="mt-4 h-7 w-3/4 rounded bg-slate-200" />
            <div className="mt-8 h-9 w-48 rounded bg-slate-200" />
            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinishLinesErrorState() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-950">
      <AlertCircle className="size-4" />
      <AlertTitle>{GOALS} could not be loaded</AlertTitle>
      <AlertDescription>
        Please refresh the page or try again once the strategic allocation source is available.
      </AlertDescription>
    </Alert>
  );
}
