'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fundName, programFunds } from '@/lib/fund-labels';
import { X, History, MessageSquare, ChevronDown, ChevronRight, ArrowLeft, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AMOUNT_LABEL } from '@/lib/public-sections';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import { VersionHistoryDrawer } from './version-history-drawer';
import { PublicFeedbackForm } from './public-feedback-form';
import { ArchivedNotice } from './archived-notice';
import type {
  PublicProgramDetail,
  PublicProjectActivity,
  PublicFeedbackItem,
  PublicProjectActivityDetail,
} from '@/lib/api';
import {
  loadPublicProgram,
  loadPublicFeedback,
  loadPublicVersions,
  submitPublicFeedback,
  loadPublicProjectActivity,
} from '@/app/(public)/budget/_actions';
import { BrandText } from '@/components/brand/brand-text';
import { GOAL } from '@/lib/goal-label';


const FEEDBACK_CAP = 30;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return '—';
  return `${MONTH_NAMES[month - 1] ?? ''} ${year}`.trim();
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatImplementationPeriod(item: {
  implementationStartMonth?: number | null;
  implementationStartYear?: number | null;
  implementationEndMonth?: number | null;
  implementationEndYear?: number | null;
}): string {
  const start = formatMonthYear(item.implementationStartMonth, item.implementationStartYear);
  const end = formatMonthYear(item.implementationEndMonth, item.implementationEndYear);
  if (start === '—' && end === '—') return '—';
  if (start === '—') return `Until ${end}`;
  if (end === '—') return `From ${start}`;
  return `${start} – ${end}`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function PATypeBadge({ type }: { type: string }) {
  const isProject = type === 'PROJECT';
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
        isProject
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-orange-50 text-orange-700 border-orange-200',
      )}
    >
      {isProject ? 'Project' : 'Activity'}
    </span>
  );
}

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (sentiment === 'POSITIVE') return <ThumbsUp className="h-3 w-3 text-green-500" />;
  if (sentiment === 'NEGATIVE') return <ThumbsDown className="h-3 w-3 text-red-500" />;
  if (sentiment === 'NEUTRAL') return <Minus className="h-3 w-3 text-slate-400" />;
  return null;
}

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General',
  CONCERN: 'Concern',
  SUGGESTION: 'Suggestion',
  QUESTION: 'Question',
  OTHER: 'Other',
};

/** A row's name, kind and amount: one line from `sm`, the name on its own line below that. */
const ROW_CLS = 'flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left text-sm';

function PARow({
  pa,
  subItems,
  onViewDetail,
}: {
  pa: PublicProjectActivity;
  subItems: PublicProjectActivity[];
  onViewDetail: (pa: PublicProjectActivity) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = subItems.length > 0;
  const displayAmount = pa.proposedBudget ?? pa.grandTotal;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-start gap-1 px-3 py-2">
        {/* Only a row with children gets the toggle: an invisible one left a
            blank gutter beside every leaf row, which on a phone is a fifth of
            the width. */}
        {hasChildren && (
          <button
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-slate-100"
            onClick={(e) => { e.stopPropagation(); setExpanded((o) => !o); }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </button>
        )}
        <button
          className={ROW_CLS}
          onClick={() => onViewDetail(pa)}
        >
          <span className="min-w-0 basis-full font-medium text-slate-800 hover:underline sm:basis-0 sm:flex-1">{pa.name}</span>
          <PATypeBadge type={pa.type} />
          <span className="ml-auto font-mono text-xs tabular-nums text-slate-600 sm:ml-0">
            {formatCurrency(displayAmount)}
          </span>
        </button>
      </div>
      {expanded && hasChildren && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {subItems.map((child) => (
            <button
              key={child.id}
              className={cn(ROW_CLS, 'w-full px-3 py-2 pl-9 hover:bg-slate-50')}
              onClick={() => onViewDetail(child)}
            >
              <span className="min-w-0 basis-full text-slate-700 hover:underline sm:basis-0 sm:flex-1">{child.name}</span>
              <PATypeBadge type={child.type} />
              <span className="ml-auto font-mono text-xs tabular-nums text-slate-600 sm:ml-0">
                {formatCurrency(child.proposedBudget ?? child.grandTotal)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="space-y-2">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-1/3 rounded bg-slate-200" />
        <div className="h-3 w-1/4 rounded bg-slate-200" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-slate-200" />
        <div className="h-3 w-4/5 rounded bg-slate-200" />
        <div className="h-3 w-3/5 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

const BUDGET_CATEGORIES = [
  {
    key: 'ps',
    label: 'Personnel Services (PS)',
    barCls: 'bg-violet-400',
    labelCls: 'text-violet-700',
    borderCls: 'border-violet-200',
    bgCls: 'bg-violet-50',
  },
  {
    key: 'mooe',
    label: 'Maint. & Other Expenses (MOOE)',
    barCls: 'bg-amber-400',
    labelCls: 'text-amber-700',
    borderCls: 'border-amber-200',
    bgCls: 'bg-amber-50',
  },
  {
    key: 'fe',
    label: 'Financial Expenses (FE)',
    barCls: 'bg-rose-400',
    labelCls: 'text-rose-700',
    borderCls: 'border-rose-200',
    bgCls: 'bg-rose-50',
  },
  {
    key: 'co',
    label: 'Capital Outlay (CO)',
    barCls: 'bg-teal-400',
    labelCls: 'text-teal-700',
    borderCls: 'border-teal-200',
    bgCls: 'bg-teal-50',
  },
] as const;

function formatPct(v: number): string {
  if (v === 0) return '0%';
  if (v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

function BudgetCards({ psTotal, mooeTotal, feTotal = '0', coTotal, grandTotal, summaryAmount = grandTotal, summaryLabel = 'Grand Total' }: {
  psTotal: string;
  mooeTotal: string;
  feTotal?: string;
  coTotal: string;
  grandTotal: string;
  summaryAmount?: string;
  summaryLabel?: string;
}) {
  // Share of the figure actually shown above the cards. `grandTotal` is the
  // line-item rollup, which is structurally zero while line-item entry is
  // deferred (D17) — dividing by it flattened every bar to 0%.
  const total = parseFloat(summaryAmount) || parseFloat(grandTotal) || 0;
  const values = { ps: parseFloat(psTotal) || 0, mooe: parseFloat(mooeTotal) || 0, fe: parseFloat(feTotal) || 0, co: parseFloat(coTotal) || 0 };
  const amounts = { ps: psTotal, mooe: mooeTotal, fe: feTotal, co: coTotal };
  const pct = (v: number) => total > 0 ? (v / total) * 100 : 0;

  // FE (specs/008) shows only when there is some: most rows, and the whole
  // enacted 2026 budget, have none, and an empty fourth card is noise.
  const categories = BUDGET_CATEGORIES.filter(
    (cat) => cat.key !== 'fe' || values.fe !== 0,
  ).map((cat) => ({
    ...cat,
    value: amounts[cat.key],
    pct: pct(values[cat.key]),
    isZero: values[cat.key] === 0,
  }));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-xs font-medium text-blue-600">{summaryLabel}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-blue-900">
          {formatCurrency(summaryAmount)}
        </p>
        {total > 0 && (
          <div className="mt-2.5 flex h-3 gap-px overflow-hidden rounded-full bg-white">
            {categories.map((cat) => cat.pct > 0 && (
              <div
                key={cat.key}
                className={cn('h-full', cat.barCls)}
                style={{ width: `${cat.pct}%`, minWidth: '3px' }}
                title={`${cat.label}: ${formatPct(cat.pct)}`}
              />
            ))}
          </div>
        )}
      </div>
      {/* Side by side from `sm`. Narrower, a third of a phone cannot hold
          "₱19,287,003.00", so each class is one row: label left, amount right. */}
      <div className={cn('grid grid-cols-1 gap-2', categories.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        {categories.map((cat) => (
          <div
            key={cat.key}
            className={cn(
              'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-lg border px-3 py-2 sm:grid-cols-1',
              cat.borderCls, cat.bgCls, cat.isZero && 'opacity-40',
            )}
          >
            <p className={cn('text-[10px] font-medium leading-tight', cat.labelCls)}>{cat.label}</p>
            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900 sm:mt-0.5">
              {formatCurrency(cat.value)}
            </p>
            {total > 0 && (
              <p className={cn('text-[10px] tabular-nums', cat.labelCls)}>{formatPct(cat.pct)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PADetailBodyProps {
  detail: PublicProjectActivityDetail;
  programName: string;
  onBackToProgram: () => void;
  onNavigateToParent?: (id: string) => void;
  onNavigateToChild?: (id: string) => void;
  amountLabel: string;
}

function PADetailBody({ detail, programName, onBackToProgram, onNavigateToParent, onNavigateToChild, amountLabel }: PADetailBodyProps) {
  const period = formatImplementationPeriod(detail);
  const lineItems = detail.lineItems ?? [];
  const children = detail.children ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Breadcrumb */}
      <p className="flex flex-wrap items-center gap-0.5 text-xs text-slate-500 px-1">
        <button
          type="button"
          onClick={onBackToProgram}
          className="font-medium text-blue-700 hover:underline focus-visible:outline-none"
        >
          {programName}
        </button>
        {detail.parent && (
          <>
            <span className="mx-1 text-slate-400">/</span>
            {onNavigateToParent ? (
              <button
                type="button"
                onClick={() => onNavigateToParent(detail.parent!.id)}
                className="font-medium text-blue-700 hover:underline focus-visible:outline-none"
              >
                {detail.parent.name}
              </button>
            ) : (
              <span className="font-medium text-slate-700">{detail.parent.name}</span>
            )}
          </>
        )}
      </p>

      <Section title="Administrative Details">
        <dl>
          <DetailRow label="Implementation Period">{period}</DetailRow>
        </dl>
      </Section>

      <Section title="Description">
        {detail.description ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{detail.description}</p>
        ) : (
          <p className="text-sm italic text-slate-400">No description provided.</p>
        )}
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/70 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
            Expected Output
          </p>
          {detail.expectedOutput ? (
            <p className="text-sm font-medium leading-6 text-blue-950">{detail.expectedOutput}</p>
          ) : (
            <p className="text-sm italic text-slate-500">Not yet stated.</p>
          )}
        </div>
        {detail.remarks && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Remarks
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.remarks}</p>
          </div>
        )}
      </Section>

      <Section title="Amount by Expense Class">
        <BudgetCards
          psTotal={detail.psTotal}
          mooeTotal={detail.mooeTotal}
          feTotal={detail.feTotal}
          coTotal={detail.coTotal}
          grandTotal={detail.grandTotal}
          summaryAmount={detail.proposedAmount}
          summaryLabel={lineItems.length > 0 ? 'Grand Total' : amountLabel}
        />
      </Section>

      {lineItems.length > 0 && (
        <Section title={`Line Items (${lineItems.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-1.5 pr-3 font-medium">Description</th>
                  <th className="pb-1.5 pr-3 text-right font-medium">Qty</th>
                  <th className="pb-1.5 pr-3 text-right font-medium">Unit Cost</th>
                  <th className="pb-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="py-1.5 pr-3 text-slate-700">
                      <div className="font-medium">{li.uacsDescription}</div>
                      <div className="text-slate-400">
                        {li.uacsCode} · {li.expenseClass} · {li.unit}
                      </div>
                      {li.remarks && (
                        <div className="mt-0.5 text-slate-400 italic">{li.remarks}</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{li.quantity}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(li.unitCost)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-slate-800">
                      {formatCurrency(li.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {children.length > 0 && (
        <Section title={`Activities (${children.length})`}>
          <div className="space-y-2">
            {children.map((child) => (
              onNavigateToChild ? (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onNavigateToChild(child.id)}
                  className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span className="flex-1 text-left text-slate-800">{child.name}</span>
                  <PATypeBadge type={child.type} />
                  <span className="font-mono text-xs tabular-nums text-slate-600">
                    {formatCurrency(child.proposedAmount)}
                  </span>
                </button>
              ) : (
                <div
                  key={child.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="flex-1 text-slate-800">{child.name}</span>
                  <PATypeBadge type={child.type} />
                  <span className="font-mono text-xs tabular-nums text-slate-600">
                    {formatCurrency(child.proposedAmount)}
                  </span>
                </div>
              )
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface PublicProgramDrawerProps {
  programId: string | null;
  initialPaId?: string | null;
  onClose: () => void;
  onFeedbackSubmitted?: (programId: string) => void;
  /** "Estimated Cost" on an AIP year, "Appropriation" on an enacted one (`AMOUNT_LABEL`). */
  amountLabel?: string;
}

const DEFAULT_DRAWER_WIDTH = 1100;

export function PublicProgramDrawer({ programId, initialPaId, onClose, onFeedbackSubmitted, amountLabel = AMOUNT_LABEL.aip }: PublicProgramDrawerProps) {
  const [program, setProgram] = useState<PublicProgramDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionCount, setVersionCount] = useState<number | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<PublicFeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Scroll anchor for the feedback section
  const feedbackRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);

  // Resizable drawer
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_DRAWER_WIDTH);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = drawerWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [drawerWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = dragStartX.current - e.clientX;
    const min = 320;
    const max = window.innerWidth;
    setDrawerWidth(Math.min(max, Math.max(min, dragStartWidth.current + delta)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // PA navigation state
  const [selectedPa, setSelectedPa] = useState<PublicProjectActivity | null>(null);
  const [previousPa, setPreviousPa] = useState<PublicProjectActivity | null>(null);
  const [paDetail, setPaDetail] = useState<PublicProjectActivityDetail | null>(null);
  const [paLoading, setPaLoading] = useState(false);
  const [paError, setPaError] = useState<string | null>(null);

  const refreshFeedback = useCallback(async (id: string) => {
    setFeedbackLoading(true);
    const result = await loadPublicFeedback(id);
    setFeedbackLoading(false);
    if (!('error' in result)) setFeedbackItems(result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!programId) {
        setProgram(null);
        setError(null);
        setFeedbackItems([]);
        setSelectedPa(null);
        setPaDetail(null);
        setVersionCount(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      setSelectedPa(null);
      setPreviousPa(null);
      setPaDetail(null);
      setVersionCount(null);
      const [result, versionsResult] = await Promise.all([
        loadPublicProgram(programId),
        loadPublicVersions(programId),
      ]);
      if (cancelled) return;
      setIsLoading(false);
      if ('error' in result) {
        setError(result.error);
      } else {
        setProgram(result);
        void refreshFeedback(programId);
      }
      if (Array.isArray(versionsResult)) {
        setVersionCount(versionsResult.length);
      }
    })();
    return () => { cancelled = true; };
  }, [programId, refreshFeedback]);

  const handleViewPa = useCallback(async (pa: PublicProjectActivity, from: PublicProjectActivity | null = null) => {
    if (!programId) return;
    setPreviousPa(from);
    setSelectedPa(pa);
    setPaDetail(null);
    setPaError(null);
    setPaLoading(true);
    const result = await loadPublicProjectActivity(programId, pa.id);
    setPaLoading(false);
    if ('error' in result) {
      setPaError(result.error);
    } else {
      setPaDetail(result);
    }
  }, [programId]);

  // Auto-navigate to a PA when opened directly from the main list
  useEffect(() => {
    if (!program || !initialPaId || selectedPa) return;
    const pa = program.projectActivities.find((p) => p.id === initialPaId);
    if (!pa) return;
    const id = setTimeout(() => { void handleViewPa(pa); }, 0);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, initialPaId]);

  const handleBackToProgram = () => {
    setSelectedPa(null);
    setPreviousPa(null);
    setPaDetail(null);
    setPaError(null);
  };

  const handleBack = () => {
    if (previousPa) {
      void handleViewPa(previousPa, null);
    } else {
      handleBackToProgram();
    }
  };

  const handleClose = () => {
    setVersionHistoryOpen(false);
    setSelectedPa(null);
    setPreviousPa(null);
    setPaDetail(null);
    onClose();
  };

  const scrollToFeedback = () => {
    // When in PA view, go back to program first, then scroll
    if (selectedPa) {
      handleBackToProgram();
      setTimeout(() => {
        feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } else {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const implementingParty =
    program?.office
      ? program.office.acronym
        ? `${program.office.acronym} — ${program.office.name}`
        : program.office.name
      : '—';

  const topLevelPAs = program?.projectActivities.filter((pa) => !pa.parentProjectActivityId) ?? [];
  // The program's headline budget before line-item breakdown — read, never
  // re-derived. Summing the root PAs shows ₱0.00 for a program that states its
  // own costs, because it holds no PAs at all.
  const programProposedTotal = String(program?.proposedTotal ?? '0.00');
  // No line-item rollup yet ⇒ show the proposed total instead of the grand total.
  const programHasLineItems = (parseFloat(program?.grandTotal ?? '0') || 0) > 0;
  const isPaView = !!selectedPa;

  const paHeaderColor =
    selectedPa?.type === 'PROJECT'
      ? { bg: 'bg-green-600', border: 'border-green-700', text: 'text-green-100', hover: 'hover:bg-green-700' }
      : { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-orange-100', hover: 'hover:bg-orange-600' };

  const visibleFeedback = feedbackItems.slice(0, FEEDBACK_CAP);
  const hiddenCount = feedbackItems.length - visibleFeedback.length;

  return (
    <>
      <Sheet
        open={!!programId}
        onOpenChange={(open) => { if (!open) handleClose(); }}
      >
        <SheetContent
          side="right"
          className="flex flex-col p-0"
          style={{ width: `min(${drawerWidth}px, 100vw)`, maxWidth: 'none' }}
          showCloseButton={false}
        >
          {/* Drag-to-resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-blue-400/50 active:bg-blue-500/70"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            aria-hidden="true"
          />

          {/* ── Sticky header ── */}
          {isPaView ? (
            /* PA view: slim colored label strip + white name/actions area */
            <>
              <div className={cn('shrink-0 flex items-center justify-between px-6 py-4', paHeaderColor.bg)}>
                <span className={cn('text-xs font-bold uppercase tracking-widest', paHeaderColor.text)}>
                  {selectedPa.type === 'PROJECT' ? 'Project Overview' : 'Activity Overview'}
                </span>
                <button
                  onClick={handleClose}
                  className={cn('rounded p-1', paHeaderColor.text, paHeaderColor.hover)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
              <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                <div className="mb-1">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                </div>
                <h2 className="text-lg font-semibold leading-snug text-slate-900">
                  {selectedPa.name}
                </h2>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setVersionHistoryOpen(true)}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    {versionCount !== null && versionCount > 1
                      ? `Revised ${versionCount} time${versionCount > 1 ? 's' : ''}`
                      : 'Version History'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={scrollToFeedback}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Feedback
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Program view: slim blue label strip + white name/actions area */
            <>
              <div className="shrink-0 flex items-center justify-between bg-blue-600 px-6 py-4">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-100">
                  Program Overview
                </span>
                <button
                  onClick={handleClose}
                  className="rounded p-1 text-blue-200 hover:bg-blue-700 hover:text-white"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
              <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                {isLoading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-5 w-3/4 rounded bg-slate-200" />
                    <div className="h-3.5 w-40 rounded bg-slate-200" />
                  </div>
                ) : program ? (
                  <>
                    <h2 className="text-lg font-semibold leading-snug text-slate-900">
                      {program.name}
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] tracking-tight text-slate-400">
                      {program.aipReferenceCode ?? program.tentativeAipReferenceCode}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{implementingParty}</p>
                    {program.lastUpdatedAt && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Last updated {formatAbsolute(program.lastUpdatedAt)}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setVersionHistoryOpen(true)}
                      >
                        <History className="mr-1.5 h-3.5 w-3.5" />
                        {versionCount !== null && versionCount > 0
                          ? `Revised ${versionCount} time${versionCount > 1 ? 's' : ''}`
                          : 'Version History'}
                      </Button>
                      {!program.archived && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={scrollToFeedback}
                        >
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                          Leave Feedback
                        </Button>
                      )}
                    </div>
                    {program.archived && (
                      <ArchivedNotice archived={program.archived} />
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}

          {/* ── Scrollable body ── */}
          <div ref={scrollableRef} className="flex-1 overflow-y-auto bg-slate-50">
            {isPaView ? (
              /* PA detail body */
              paLoading ? (
                <DrawerSkeleton />
              ) : paError ? (
                <div className="flex items-center justify-center py-20 text-center">
                  <p className="text-sm text-red-600">{paError}</p>
                </div>
              ) : paDetail ? (
                <PADetailBody
                  detail={paDetail}
                  programName={program?.name ?? ''}
                  amountLabel={amountLabel}
                  onBackToProgram={handleBackToProgram}
                  onNavigateToParent={(id) => {
                    const pa = program?.projectActivities.find((p) => p.id === id);
                    if (pa) void handleViewPa(pa, null);
                  }}
                  onNavigateToChild={(id) => {
                    const pa = program?.projectActivities.find((p) => p.id === id);
                    if (pa) void handleViewPa(pa, selectedPa ?? null);
                  }}
                />
              ) : null
            ) : (
              /* Program detail body */
              isLoading ? (
                <DrawerSkeleton />
              ) : error ? (
                <div className="flex items-center justify-center py-20 text-center">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              ) : program ? (
                <div className="p-4 space-y-4">
                  <Section title="Administrative Details">
                    <dl>
                      <DetailRow label="Implementing Office">{implementingParty}</DetailRow>
                      <DetailRow label="AIP Cycle">AIP {program.aipCycle.fiscalYear}</DetailRow>
                      <DetailRow label={GOAL}>{program.finishLine?.name ?? '—'}</DetailRow>
                      <DetailRow label="Fund Sources">
                        {programFunds(program).length > 0 ? (
                          <ul className="space-y-0.5">
                            {programFunds(program).map((f) => (
                              <li key={f}>{fundName(f)}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="italic text-slate-500">Not stated</span>
                        )}
                      </DetailRow>
                      <DetailRow label="Implementation">{formatImplementationPeriod(program)}</DetailRow>
                      {program.subFinishLine && (
                        <DetailRow label={`Sub-${GOAL}`}>{program.subFinishLine.name}</DetailRow>
                      )}
                      {program.papSector && (
                        <DetailRow label="PAP Sector">
                          {program.papSector.code} — {program.papSector.name}
                        </DetailRow>
                      )}
                      {program.supportingOffices.length > 0 && (
                        <DetailRow label="Supporting Offices">
                          <div className="flex flex-wrap gap-1.5">
                            {program.supportingOffices.map((so) => (
                              <span key={so.office.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                                {so.office.acronym
                                  ? `${so.office.acronym} — ${so.office.name}`
                                  : so.office.name}
                              </span>
                            ))}
                          </div>
                        </DetailRow>
                      )}
                    </dl>
                  </Section>

                  <Section title="Description">
                    {program.description ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {program.description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-slate-400">No description provided.</p>
                    )}
                    <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/70 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
                        Expected Output / MFO
                      </p>
                      {program.expectedOutput ? (
                        <p className="text-sm font-medium leading-6 text-blue-950">
                          {program.expectedOutput}
                        </p>
                      ) : (
                        <p className="text-sm italic text-slate-500">Not yet stated.</p>
                      )}
                    </div>
                    {program.remarks && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Remarks
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-slate-700">
                          {program.remarks}
                        </p>
                      </div>
                    )}
                  </Section>

                  <Section title="Amount by Expense Class">
                    <BudgetCards
                      psTotal={program.psTotal}
                      mooeTotal={program.mooeTotal}
                      feTotal={program.feTotal}
                      coTotal={program.coTotal}
                      grandTotal={program.grandTotal}
                      summaryAmount={programHasLineItems ? program.grandTotal : programProposedTotal}
                      summaryLabel={programHasLineItems ? 'Grand Total' : amountLabel}
                    />
                  </Section>

                  {topLevelPAs.length > 0 && (
                    <Section title={`Projects & Activities (${program.projectActivities.length})`}>
                      <div className="space-y-2">
                        {topLevelPAs.map((pa) => (
                          <PARow
                            key={pa.id}
                            pa={pa}
                            subItems={program.projectActivities.filter(
                              (c) => c.parentProjectActivityId === pa.id,
                            )}
                            onViewDetail={handleViewPa}
                          />
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── Feedback section (anchored) ── */}
                  <div ref={feedbackRef}>
                    <Section
                      title={`Public Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}`}
                    >
                      {!program.archived && (
                        <PublicFeedbackForm
                          onSubmit={(dto) => submitPublicFeedback(program.id, dto)}
                          onSuccess={() => {
                            void refreshFeedback(program.id);
                            onFeedbackSubmitted?.(program.id);
                          }}
                        />
                      )}

                      {feedbackLoading ? (
                        <div className="mt-4 space-y-2">
                          {[1, 2].map((i) => (
                            <div
                              key={i}
                              className="animate-pulse space-y-1 rounded-md border border-slate-100 p-3"
                            >
                              <div className="h-3 w-1/3 rounded bg-slate-200" />
                              <div className="h-3 w-full rounded bg-slate-200" />
                              <div className="h-3 w-4/5 rounded bg-slate-200" />
                            </div>
                          ))}
                        </div>
                      ) : feedbackItems.length === 0 ? (
                        <p className="mt-4 text-sm italic text-slate-400">
                          No public feedback yet. Be the first to leave a comment.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {visibleFeedback.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2.5 space-y-2.5"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <SentimentIcon sentiment={item.sentiment} />
                                    <span className="text-xs font-medium text-slate-800 truncate">
                                      {item.submitterName ?? 'Anonymous'}
                                    </span>
                                    {item.category && (
                                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                        {CATEGORY_LABELS[item.category] ?? item.category}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className="shrink-0 text-xs text-slate-400"
                                    title={new Date(item.createdAt).toLocaleString()}
                                  >
                                    {formatRelative(item.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                  {item.content}
                                </p>
                              </div>
                              {item.officialReply && (
                                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                                  <p className="text-xs font-medium text-blue-700 mb-1">LGU <BrandText field="placeName" /></p>
                                  <p className="whitespace-pre-wrap text-sm text-blue-900">{item.officialReply}</p>
                                  {item.officialReplyEditedAt && (
                                    <p className="text-xs text-blue-400 mt-1">
                                      Edited {new Date(item.officialReplyEditedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {hiddenCount > 0 && (
                            <p className="text-center text-xs text-slate-400">
                              Showing {FEEDBACK_CAP} of {feedbackItems.length} comments
                            </p>
                          )}
                        </div>
                      )}
                    </Section>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </SheetContent>
      </Sheet>

      {program && (
        <VersionHistoryDrawer
          programId={program.id}
          programName={program.name}
        amountLabel={amountLabel}
          isOpen={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
        />
      )}
    </>
  );
}
