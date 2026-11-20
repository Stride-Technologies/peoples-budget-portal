'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardSummary } from '@/lib/api';
import {
  addDecimalStrings,
  formatPesoWhole,
  subtractDecimalStrings,
} from '@/lib/currency-formatter';
import { fundSourceLabel } from '@/lib/schemas';
import { cn } from '@/lib/utils';

/**
 * Fallback slice colours for finish lines with no `color` set. Eight entries
 * because there are eight finish lines (FL1–FL8); the modulo is belt-and-braces.
 */
const PALETTE = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#65a30d',
  '#db2777',
];

export type BudgetFilter = 'all' | 'published' | 'draft';

const FILTERS: { value: BudgetFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
];

function FilterToggle({
  value,
  onChange,
}: {
  value: BudgetFilter;
  onChange: (v: BudgetFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Budget filter"
      className="inline-flex rounded-md border border-neutral-200 p-0.5"
    >
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === f.value
              ? 'bg-blue-50 text-blue-800'
              : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Pick the amounts for one filter, keeping the exact decimal string. */
function slicesFor(
  byFinishLine: DashboardSummary['byFinishLine'],
  filter: BudgetFilter,
) {
  return byFinishLine
    .map((fl, i) => {
      const total =
        filter === 'published'
          ? fl.published.total
          : filter === 'draft'
            ? fl.draft.total
            : addDecimalStrings([fl.published.total, fl.draft.total]);
      const count =
        filter === 'published'
          ? fl.published.count
          : filter === 'draft'
            ? fl.draft.count
            : fl.published.count + fl.draft.count;
      return {
        name: fl.name,
        total,
        count,
        color: fl.color ?? PALETTE[i % PALETTE.length],
        // Recharts needs a number to lay out arc geometry. Only the *pixels*
        // come from this — every peso the user reads is rendered from `total`,
        // the untouched decimal string.
        value: Number(total),
      };
    })
    .filter((s) => s.value > 0);
}

type Slice = ReturnType<typeof slicesFor>[number];

function PieTooltip({
  active,
  payload,
  grandTotal,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
  grandTotal: number;
}) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  const share = grandTotal > 0 ? (slice.value / grandTotal) * 100 : 0;
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{slice.name}</p>
      <p className="mt-0.5 text-sm text-neutral-700">
        {formatPesoWhole(slice.total)}
      </p>
      <p className="text-xs text-neutral-400">
        {share.toFixed(1)}% · {slice.count} program
        {slice.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function BudgetPie({
  byFinishLine,
}: {
  byFinishLine: DashboardSummary['byFinishLine'];
}) {
  const [filter, setFilter] = useState<BudgetFilter>('all');

  // Re-summed client-side from data already on the page: switching the filter
  // costs no request, which is the reason the API ships both buckets.
  const slices = useMemo(
    () => slicesFor(byFinishLine, filter),
    [byFinishLine, filter],
  );
  const total = useMemo(
    () => addDecimalStrings(slices.map((s) => s.total)),
    [slices],
  );
  const grandTotal = slices.reduce((n, s) => n + s.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">
            {formatPesoWhole(total)}
          </p>
          <p className="text-xs text-neutral-400">
            Total proposed budget ·{' '}
            {filter === 'all'
              ? 'drafts and published'
              : filter === 'published'
                ? 'published only'
                : 'drafts only'}
          </p>
        </div>
        <FilterToggle value={filter} onChange={setFilter} />
      </div>

      {slices.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          No proposed budget recorded for this selection yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
          {/* min-w-0: a `1fr` grid track sizes to its content by default, which
              leaves ResponsiveContainer measuring 0px and rendering nothing. */}
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={1}
                  stroke="#fff"
                  strokeWidth={2}
                  // Recharts animates in over 1.5s by default. A dashboard that
                  // withholds its figures for a second and a half is worse than
                  // one that just shows them, and a static chart keeps the
                  // Playwright screenshots deterministic.
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={<PieTooltip grandTotal={grandTotal} />}
                  wrapperStyle={{ outline: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Hand-rolled legend: Recharts' own can't show the peso amount, and
              the share is the reason anyone reads this card. */}
          <ul className="space-y-1.5 text-sm">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-neutral-700">{s.name}</span>
                <span className="ml-auto pl-4 text-xs tabular-nums text-neutral-400">
                  {grandTotal > 0
                    ? `${((s.value / grandTotal) * 100).toFixed(0)}%`
                    : '0%'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatWeek(weekStart: string) {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function SubmissionsOverTime({
  publishedByWeek,
}: {
  publishedByWeek: DashboardSummary['publishedByWeek'];
}) {
  if (publishedByWeek.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        Nothing published yet this cycle.
      </p>
    );
  }

  const data = publishedByWeek.map((w) => ({
    ...w,
    label: formatWeek(w.weekStart),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
          }}
          labelFormatter={(label) => `Week of ${label}`}
          formatter={(value) => [String(value ?? 0), 'Published']}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#2563eb"
          fill="#dbeafe"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const MIX = [
  { key: 'ps', label: 'Personnel Services', color: 'bg-blue-500' },
  { key: 'mooe', label: 'MOOE', color: 'bg-green-500' },
  { key: 'fe', label: 'Financial Expenses', color: 'bg-amber-500' },
  { key: 'co', label: 'Capital Outlay', color: 'bg-purple-500' },
] as const;

type MixRow = {
  key: string;
  label: string;
  color: string;
  /** Decimal string — the displayed figure. */
  total: string;
  /** `Number(total)`, for bar width only. Never displayed. */
  value: number;
};

/**
 * The labelled-bar list shared by {@link BudgetMix} and {@link FundSourceMix}.
 *
 * `total` is passed in rather than summed here: Budget Mix's headline is the
 * budget's own grand total, and the rows only reach it because the remainder is
 * rendered as an explicit **Not yet classified** bar. Summing the rows instead
 * would quietly agree with itself even if that bar were ever dropped.
 */
function MixBars({ rows, total }: { rows: MixRow[]; total: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  if (rows.every((r) => r.value === 0)) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No proposed budget recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between border-b border-neutral-100 pb-2 text-sm font-medium text-neutral-900">
        <span>Total</span>
        <span className="tabular-nums">{formatPesoWhole(total)}</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>{row.label}</span>
            <span className="tabular-nums">{formatPesoWhole(row.total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn('h-full rounded-full transition-all', row.color)}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * PS / MOOE / FE / CO split. Bars rather than a second pie — four categories on a
 * page that already has a pie reads as decoration, and the bars make the
 * absolute peso figures legible side by side.
 *
 * The **Unclassified** row is not padding. `proposedTotal` and the per-expense
 * class family (`psProposedTotal` etc.) are rollups maintained separately, and
 * in practice most programs fill the former and not the latter — measured at
 * 97% of the published budget on the FY2027 cycle. Without the remainder this
 * card would show ₱3.4M of bars beneath a ₱151M headline and read as broken.
 */
export function BudgetMix({ budget }: { budget: DashboardSummary['budget'] }) {
  const classified = MIX.map((m) => {
    const total = addDecimalStrings([budget.published[m.key], budget.draft[m.key]]);
    return { ...m, total, value: Number(total) };
  });

  const grandTotal = addDecimalStrings([budget.published.total, budget.draft.total]);
  const unclassified = subtractDecimalStrings(
    grandTotal,
    addDecimalStrings(classified.map((r) => r.total)),
  );

  const rows =
    Number(unclassified) > 0
      ? [
          ...classified,
          {
            key: 'unclassified' as const,
            label: 'Not yet classified',
            color: 'bg-neutral-300',
            total: unclassified,
            value: Number(unclassified),
          },
        ]
      : classified;

  return <MixBars rows={rows} total={grandTotal} />;
}

/**
 * Proposed budget per fund source, same bars as {@link BudgetMix} so the two read
 * as one family.
 *
 * **Multiple funds** is a real bucket, not a rounding artefact. A PPA lists the
 * funds it draws on but carries a single unsplit estimate, so a PPA naming two
 * funds cannot be attributed to either — counting it under both would push the
 * bars past the real budget, dividing it would invent a split the city never
 * made. Bucketed once instead, which keeps these bars summing to the Budget Mix
 * grand total. **Not specified** is the imported rows that carry no fund at all;
 * the Excel export defaults those to GF, this card deliberately does not.
 */
export function FundSourceMix({
  byFundSource,
}: {
  byFundSource: DashboardSummary['byFundSource'];
}) {
  const rows = byFundSource
    .map((row) => ({
      ...row,
      label:
        row.key === 'MULTIPLE'
          ? 'Multiple funds'
          : row.key === 'NONE'
            ? 'Not specified'
            : fundSourceLabel(row.key),
      // Greyed like Budget Mix's "Not yet classified" — these are data qualities,
      // not funds, and colouring them as funds would misread at a glance.
      color:
        row.key === 'MULTIPLE' || row.key === 'NONE'
          ? 'bg-neutral-300'
          : 'bg-blue-500',
      value: Number(row.total), // bar geometry only — the label uses the string
    }))
    .filter((row) => row.value > 0);

  // Every bucket is disjoint — each PPA lands in exactly one — so the rows do sum
  // to the cycle's proposed budget, and this total should match Budget Mix's.
  const total = addDecimalStrings(rows.map((r) => r.total));

  return <MixBars rows={rows} total={total} />;
}
