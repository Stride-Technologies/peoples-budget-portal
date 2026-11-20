'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight, User, Calendar, TrendingUp, TrendingDown, Plus, Minus, FileEdit, ListPlus, ListMinus, PencilLine, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import type { PublicVersionListItem, PublicVersionDetail } from '@/lib/api';
import { loadPublicVersions, loadPublicVersion } from '@/app/(public)/budget/_actions';
import { fromCentavos, isEmptyChange, toCentavos, versionChanges, type RowStatus, type VersionChanges, type VersionSnapshot } from '@/lib/version-diff';
import { fundName, papClassName, programFunds } from '@/lib/fund-labels';
import { FUND_SOURCES } from '@/lib/schemas';
import { GOAL } from '@/lib/goal-label';


const ROLE_LABEL: Record<string, string> = {
  STAFF: 'Staff',
  HEAD: 'Head',
  SUPER_ADMIN: 'Admin',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type LineItemSnap = {
  id: string;
  expenseClass?: string;
  uacsCode?: string;
  quantity?: string;
  unit?: string;
  unitCost?: string;
  lineTotal?: string;
  remarks?: string | null;
};

type SnapshotData = {
  name?: string;
  aipReferenceCode?: string | null;
  tentativeAipReferenceCode?: string | null;
  papClass?: string | null;
  papSector?: { code?: string | null; name?: string | null } | null;
  majorFinalOutput?: string | null;
  fundSources?: string[] | null;
  finishLine?: { name?: string } | null;
  office?: { name?: string; acronym?: string } | null;
  civilSocietyOrganization?: { name?: string } | null;
  description?: string | null;
  expectedOutput?: string;
  implementationStartMonth?: number | null;
  implementationStartYear?: number | null;
  implementationEndMonth?: number | null;
  implementationEndYear?: number | null;
  psTotal?: string;
  mooeTotal?: string;
  feTotal?: string;
  coTotal?: string;
  grandTotal?: string;
  proposedTotal?: string;
  projectActivities?: Array<{
    id: string;
    name: string;
    type: string;
    description?: string | null;
    expectedOutput?: string;
    grandTotal?: string;
    proposedBudget?: string | null;
    fundSources?: string[] | null;
    orderIndex?: number;
    parentProjectActivityId?: string | null;
    lineItems?: LineItemSnap[];
  }>;
};

// ── Diff logic ────────────────────────────────────────────────────────────────

type DiffTag =
  | { kind: 'budget-up';   amount: string }
  | { kind: 'budget-down'; amount: string }
  | { kind: 'pa-added';    count: number }
  | { kind: 'pa-removed';  count: number }
  | { kind: 'pa-changed';  count: number }
  | { kind: 'moved';       to: string }
  | { kind: 'li-added';    count: number }
  | { kind: 'li-removed';  count: number }
  | { kind: 'li-updated';  count: number }
  | { kind: 'details' };

function flatLineItems(snapshot: SnapshotData): Map<string, LineItemSnap> {
  const map = new Map<string, LineItemSnap>();
  for (const pa of snapshot.projectActivities ?? []) {
    for (const li of pa.lineItems ?? []) {
      map.set(li.id, li);
    }
  }
  return map;
}

/**
 * The chips on a version's row: the program-level picture from `versionChanges`
 * (exact money, every level of the tree), plus line items, which only staff
 * entries carry.
 */
function diffSnapshots(prev: SnapshotData, curr: SnapshotData, changes: VersionChanges): DiffTag[] {
  const tags: DiffTag[] = [];
  if (changes.total)
    tags.push(changes.total.up
      ? { kind: 'budget-up', amount: changes.total.delta }
      : { kind: 'budget-down', amount: changes.total.delta });
  const office = changes.fields.find((f) => f.label === 'Implementing office');
  if (office) tags.push({ kind: 'moved', to: office.to });
  if (changes.amounts.length) tags.push({ kind: 'pa-changed', count: changes.amounts.length });
  if (changes.added.length) tags.push({ kind: 'pa-added', count: changes.added.length });
  if (changes.removed.length) tags.push({ kind: 'pa-removed', count: changes.removed.length });

  // Line item diff (by ID, aggregated across all PAs)
  const prevLIs = flatLineItems(prev);
  const currLIs = flatLineItems(curr);
  let liAdded = 0, liRemoved = 0, liUpdated = 0;
  for (const [id, currLI] of currLIs) {
    const prevLI = prevLIs.get(id);
    if (!prevLI) { liAdded++; continue; }
    if (
      prevLI.lineTotal !== currLI.lineTotal ||
      prevLI.quantity !== currLI.quantity ||
      prevLI.unitCost !== currLI.unitCost ||
      prevLI.uacsCode !== currLI.uacsCode ||
      prevLI.unit !== currLI.unit ||
      prevLI.remarks !== currLI.remarks
    ) liUpdated++;
  }
  for (const id of prevLIs.keys()) {
    if (!currLIs.has(id)) liRemoved++;
  }
  if (liAdded > 0) tags.push({ kind: 'li-added', count: liAdded });
  if (liRemoved > 0) tags.push({ kind: 'li-removed', count: liRemoved });
  if (liUpdated > 0) tags.push({ kind: 'li-updated', count: liUpdated });

  // Anything else the public sees: other fields, renamed rows.
  if (changes.fields.some((f) => f.label !== 'Implementing office') || changes.renamed.length)
    tags.push({ kind: 'details' });

  return tags;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function DiffTags({ tags, amountLabel }: { tags: DiffTag[]; amountLabel: string }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag, i) => {
        if (tag.kind === 'budget-up') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <TrendingUp className="h-3 w-3" />
            {amountLabel} +{formatCurrency(tag.amount)}
          </span>
        );
        if (tag.kind === 'budget-down') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
            <TrendingDown className="h-3 w-3" />
            {amountLabel} −{formatCurrency(tag.amount)}
          </span>
        );
        if (tag.kind === 'pa-added') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            <Plus className="h-3 w-3" />
            {plural(tag.count, 'item')} added
          </span>
        );
        if (tag.kind === 'pa-changed') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            <PencilLine className="h-3 w-3" />
            {plural(tag.count, 'amount')} changed
          </span>
        );
        if (tag.kind === 'moved') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300">
            <ArrowRight className="h-3 w-3" />
            Moved to {tag.to}
          </span>
        );
        if (tag.kind === 'pa-removed') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
            <Minus className="h-3 w-3" />
            {plural(tag.count, 'item')} removed
          </span>
        );
        if (tag.kind === 'li-added') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
            <ListPlus className="h-3 w-3" />
            {tag.count} line item{tag.count !== 1 ? 's' : ''} added
          </span>
        );
        if (tag.kind === 'li-removed') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
            <ListMinus className="h-3 w-3" />
            {tag.count} line item{tag.count !== 1 ? 's' : ''} removed
          </span>
        );
        if (tag.kind === 'li-updated') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            <PencilLine className="h-3 w-3" />
            {tag.count} line item{tag.count !== 1 ? 's' : ''} updated
          </span>
        );
        if (tag.kind === 'details') return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            <FileEdit className="h-3 w-3" />
            Details updated
          </span>
        );
        return null;
      })}
    </div>
  );
}

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return '—';
  return `${MONTH_NAMES[month - 1] ?? ''} ${year}`.trim();
}

/** Fund codes in the change list read as names, like everywhere else in the snapshot. */
const readable = (label: string, value: string) =>
  label === 'Fund sources' && value !== '—' ? value.split(', ').map(fundName).join(', ') : value;

/** One group of the change list: collapsible, open by default, its count in the summary. */
function ChangeGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <details open className="group">
      <summary className="cursor-pointer py-1 text-xs font-semibold text-slate-700 marker:text-slate-400">
        {title} <span className="font-normal text-slate-500">({count})</span>
      </summary>
      <ul className="mt-1 space-y-1.5 pl-1">{children}</ul>
    </details>
  );
}

/** The activities inside an added or removed project, closed until asked for. */
function RowItems({ items }: { items: { name: string; amount: string }[] }) {
  if (!items.length) return null;
  return (
    <details className="mt-0.5">
      <summary className="cursor-pointer text-[11px] text-slate-500">
        Show {plural(items.length, 'item')}
      </summary>
      <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-3 text-xs">
        {items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 text-slate-700">
            <span>{it.name}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{formatCurrency(it.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Under({ name }: { name: string | null }) {
  return name ? <span className="block text-[11px] text-slate-500">in {name}</span> : null;
}

/**
 * "What changed since version N" — every difference a visitor can see, in words:
 * old → new for amounts and details, and what was added or removed, with amounts.
 */
function ChangesPanel({
  changes,
  sinceVersion,
  amountLabel,
}: {
  changes: VersionChanges;
  sinceVersion: number;
  amountLabel: string;
}) {
  return (
    <section aria-label={`What changed since version ${sinceVersion}`} className="space-y-2 border-b border-slate-200 bg-amber-50/40 p-4 text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        What changed since version {sinceVersion}
      </h4>
      {isEmptyChange(changes) ? (
        <p className="text-slate-600">Nothing a visitor can see changed in this version.</p>
      ) : (
        <>
          {changes.total && (
            <p className="text-slate-800">
              {amountLabel}: <span className="tabular-nums">{formatCurrency(changes.total.from)}</span>
              {' → '}
              <span className="font-semibold tabular-nums">{formatCurrency(changes.total.to)}</span>{' '}
              <span className={cn('tabular-nums', changes.total.up ? 'text-emerald-700' : 'text-red-700')}>
                ({changes.total.up ? '+' : '−'}{formatCurrency(changes.total.delta)})
              </span>
            </p>
          )}
          <ChangeGroup title="Details" count={changes.fields.length}>
            {changes.fields.map((f) => (
              <li key={f.label} className="text-slate-800">
                <span className="text-slate-500">{f.label}: </span>
                <span className="line-through decoration-slate-400">{readable(f.label, f.from)}</span>
                {' → '}
                <span className="font-medium">{readable(f.label, f.to)}</span>
              </li>
            ))}
          </ChangeGroup>
          <ChangeGroup title="Amounts changed" count={changes.amounts.length}>
            {changes.amounts.map((a, i) => (
              <li key={i} className="text-slate-800">
                {a.name}
                {a.was && <span className="block text-[11px] text-slate-500">renamed — was “{a.was}”</span>}
                <Under name={a.under} />
                <span className="tabular-nums text-slate-600">
                  {formatCurrency(a.from)} → <span className="font-medium text-slate-900">{formatCurrency(a.to)}</span>
                </span>
              </li>
            ))}
          </ChangeGroup>
          <ChangeGroup title="Added" count={changes.added.length}>
            {changes.added.map((a, i) => (
              <li key={i} className="text-slate-800">
                <span className="font-medium text-emerald-800">+ </span>{a.name}
                <Under name={a.under} />
                <span className="block tabular-nums text-slate-600">{formatCurrency(a.amount)}</span>
                <RowItems items={a.children} />
              </li>
            ))}
          </ChangeGroup>
          <ChangeGroup title="Removed" count={changes.removed.length}>
            {changes.removed.map((a, i) => (
              <li key={i} className="text-slate-800">
                <span className="font-medium text-red-800">− </span>{a.name}
                <Under name={a.under} />
                <span className="block tabular-nums text-slate-600">{formatCurrency(a.amount)}</span>
                <RowItems items={a.children} />
              </li>
            ))}
          </ChangeGroup>
          <ChangeGroup title="Renamed" count={changes.renamed.length}>
            {changes.renamed.map((r, i) => (
              <li key={i} className="text-slate-800">
                <span className="line-through decoration-slate-400">{r.from}</span> → <span className="font-medium">{r.to}</span>
                <Under name={r.under} />
              </li>
            ))}
          </ChangeGroup>
        </>
      )}
    </section>
  );
}

const EXPENSE_CLASSES = [
  { code: 'PS', name: 'Personal Services', key: 'psTotal' },
  { code: 'MOOE', name: 'Maintenance and Other Operating Expenses', key: 'mooeTotal' },
  { code: 'FE', name: 'Financial Expenses', key: 'feTotal' },
  { code: 'CO', name: 'Capital Outlay', key: 'coTotal' },
] as const;

type SnapPA = NonNullable<SnapshotData['projectActivities']>[number];

/** One label/value line of the snapshot's details; stacks on a phone. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 px-3 py-2 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

/** What happened to a row in this version, in words. */
function RowBadge({ status }: { status: RowStatus | undefined }) {
  if (!status) return null;
  const text =
    status.kind === 'added'
      ? 'New in this version'
      : status.kind === 'amount'
        ? `Amount changed: ${formatCurrency(status.from)} → ${formatCurrency(status.to)}`
        : status.kind === 'renamed'
          ? `Renamed (was “${status.from}”)`
          : `Renamed (was “${status.from}”); amount ${formatCurrency(status.amountFrom)} → ${formatCurrency(status.amountTo)}`;
  return (
    <span
      className={cn(
        'mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        status.kind === 'added'
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-amber-200',
      )}
    >
      {text}
    </span>
  );
}

/**
 * A published version as a visitor reads the program: what it is, how much,
 * who runs it, which funds pay for it, and every project and activity with its
 * amount and funds — rows this version changed are labelled.
 */
function SnapshotView({
  snapshot,
  amountLabel,
  rowStatus,
}: {
  snapshot: unknown;
  amountLabel: string;
  rowStatus?: Record<string, RowStatus>;
}) {
  const data = snapshot as SnapshotData;
  const pas = data.projectActivities ?? [];
  const hasLineItems = pas.some((pa) => (pa.lineItems ?? []).length > 0);
  const childrenOf = (id: string | null) =>
    pas
      .filter((pa) => (pa.parentProjectActivityId ?? null) === id)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  // A row's amount is its leaves' estimated costs, summed exactly.
  const amountOf = (pa: SnapPA): string => {
    const kids = childrenOf(pa.id);
    if (!kids.length) return pa.proposedBudget ?? pa.grandTotal ?? '0';
    return fromCentavos(kids.reduce((t, k) => t + toCentavos(amountOf(k)), 0));
  };

  const office = data.office
    ? data.office.acronym
      ? `${data.office.acronym} — ${data.office.name}`
      : (data.office.name ?? '—')
    : '—';
  const period = (() => {
    const start = formatMonthYear(data.implementationStartMonth, data.implementationStartYear);
    const end = formatMonthYear(data.implementationEndMonth, data.implementationEndYear);
    if (start === '—' && end === '—') return '—';
    if (start === '—') return `Until ${end}`;
    if (end === '—') return `From ${start}`;
    return `${start} – ${end}`;
  })();
  const funds = programFunds(data);
  const code = data.aipReferenceCode ?? data.tentativeAipReferenceCode;
  const classes = EXPENSE_CLASSES.filter((c) => c.code !== 'FE' || Number(data[c.key] ?? 0) > 0);

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => {
    const rows = childrenOf(parent);
    if (!rows.length) return null;
    return (
      <ul className={cn('space-y-1.5', depth > 0 && 'mt-1.5 border-l border-slate-200 pl-3')}>
        {rows.map((pa) => {
          const isParent = childrenOf(pa.id).length > 0;
          return (
            <li key={pa.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-slate-800', isParent && 'font-medium')}>{pa.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {pa.type === 'PROJECT' ? 'Project' : 'Activity'}
                    {!isParent &&
                      (pa.fundSources ?? []).map((f) => (
                        <span key={f} title={fundName(f)}>
                          {' · '}
                          {FUND_SOURCES.find((x) => x.value === f)?.label ?? f}
                        </span>
                      ))}
                  </p>
                  <RowBadge status={rowStatus?.[pa.id]} />
                </div>
                <span className="shrink-0 tabular-nums text-slate-700">{formatCurrency(amountOf(pa))}</span>
              </div>
              <Tree parent={pa.id} depth={depth + 1} />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-5 p-4 text-sm">
      <div>
        <h3 className="text-base font-semibold leading-snug text-slate-900">{data.name}</h3>
        {code && !code.startsWith('~') && <p className="mt-0.5 font-mono text-xs text-slate-500">{code}</p>}
      </div>

      {/* How much */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
        <p className="text-xs font-medium text-blue-700">{hasLineItems ? 'Grand Total' : amountLabel}</p>
        <p className="text-lg font-semibold tabular-nums text-blue-950">
          {formatCurrency(data.proposedTotal ?? data.grandTotal ?? '0')}
        </p>
        <dl className="mt-1.5 space-y-0.5 text-xs">
          {classes.map((c) => (
            <div key={c.code} className="flex justify-between gap-3">
              <dt className="text-slate-600">
                {c.name} ({c.code})
              </dt>
              <dd className="tabular-nums text-slate-800">{formatCurrency(data[c.key] ?? '0')}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Who, what, which funds */}
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        <Fact label="Implementing office">{office}</Fact>
        <Fact label="Fund sources">
          {funds.length ? (
            <ul>
              {funds.map((f) => (
                <li key={f}>{fundName(f)}</li>
              ))}
            </ul>
          ) : (
            <span className="italic text-slate-500">Not stated</span>
          )}
        </Fact>
        <Fact label={GOAL}>{data.finishLine?.name ?? '—'}</Fact>
        {papClassName(data.papClass) && <Fact label="Type of program">{papClassName(data.papClass)}</Fact>}
        {data.papSector?.name && (
          <Fact label="PAP sector">
            {data.papSector.code ? `${data.papSector.code} — ` : ''}
            {data.papSector.name}
          </Fact>
        )}
        {data.majorFinalOutput && <Fact label="Major final output">{data.majorFinalOutput}</Fact>}
        <Fact label="Implementation">{period}</Fact>
        <Fact label="Expected output">
          {data.expectedOutput ? (
            <span className="whitespace-pre-wrap">{data.expectedOutput}</span>
          ) : (
            <span className="italic text-slate-500">Not stated</span>
          )}
        </Fact>
        {data.description && (
          <Fact label="Description">
            <span className="whitespace-pre-wrap">{data.description}</span>
          </Fact>
        )}
      </dl>

      {/* Every project and activity */}
      {pas.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Projects &amp; activities ({pas.length})
          </h4>
          {rowStatus && Object.keys(rowStatus).length > 0 && (
            <p className="mb-2 text-xs text-slate-500">Rows this version changed are labelled.</p>
          )}
          <Tree parent={null} depth={0} />
        </section>
      )}
    </div>
  );
}

interface VersionHistoryDrawerProps {
  programId: string;
  programName: string;
  isOpen: boolean;
  onClose: () => void;
  /** "Estimated Cost" or "Appropriation" (`AMOUNT_LABEL`). */
  amountLabel?: string;
}

export function VersionHistoryDrawer({
  programId,
  programName,
  isOpen,
  onClose,
  amountLabel = 'Estimated Cost',
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<PublicVersionListItem[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [view, setView] = useState<'list' | 'snapshot'>('list');
  const [selectedVersion, setSelectedVersion] = useState<PublicVersionDetail | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  // versionId → diff tags (computed after fetching all snapshots)
  const [diffMap, setDiffMap] = useState<Record<string, DiffTag[]>>({});
  // versionId → what changed since the version before it
  const [changesMap, setChangesMap] = useState<
    Record<string, { changes: VersionChanges; since: number }>
  >({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isOpen) {
        setView('list');
        setSelectedVersion(null);
        setDiffMap({});
        setChangesMap({});
        return;
      }
      setIsLoadingVersions(true);
      const result = await loadPublicVersions(programId);
      if (cancelled) return;
      setIsLoadingVersions(false);
      if (!Array.isArray(result)) return;
      setVersions(result);

      // Fetch all snapshots in parallel to compute diffs
      const details = await Promise.all(
        result.map((v) => loadPublicVersion(programId, v.id)),
      );
      if (cancelled) return;

      // Build id → snapshot map (sorted ascending by version)
      const snapshots: Array<{ id: string; data: SnapshotData }> = [];
      for (let i = 0; i < result.length; i++) {
        const detail = details[i];
        if (detail && !('error' in detail)) {
          snapshots.push({ id: result[i].id, data: detail.snapshot as SnapshotData });
        }
      }
      // Sort by version ascending so we diff [v1→v2, v2→v3, ...]
      snapshots.sort((a, b) => {
        const va = result.find((v) => v.id === a.id)?.version ?? 0;
        const vb = result.find((v) => v.id === b.id)?.version ?? 0;
        return va - vb;
      });

      const map: Record<string, DiffTag[]> = {};
      const changes: Record<string, { changes: VersionChanges; since: number }> = {};
      const versionOf = (id: string) => result.find((v) => v.id === id)?.version ?? 0;
      for (let i = 1; i < snapshots.length; i++) {
        const c = versionChanges(
          snapshots[i - 1].data as VersionSnapshot,
          snapshots[i].data as VersionSnapshot,
        );
        changes[snapshots[i].id] = { changes: c, since: versionOf(snapshots[i - 1].id) };
        map[snapshots[i].id] = diffSnapshots(snapshots[i - 1].data, snapshots[i].data, c);
      }
      setDiffMap(map);
      setChangesMap(changes);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, programId]);

  const handleSelectVersion = async (versionId: string) => {
    setView('snapshot');
    setSelectedVersion(null);
    setSnapshotError(null);
    setIsLoadingSnapshot(true);
    const result = await loadPublicVersion(programId, versionId);
    setIsLoadingSnapshot(false);
    if ('error' in result) {
      setSnapshotError(result.error);
    } else {
      setSelectedVersion(result);
    }
  };

  const handleBack = () => {
    setView('list');
    setSelectedVersion(null);
    setSnapshotError(null);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            {view === 'snapshot' && (
              <button
                onClick={handleBack}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Back to versions</span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">
                {view === 'snapshot' && selectedVersion
                  ? `Version ${selectedVersion.version} Snapshot`
                  : 'Version History'}
              </h2>
              <p className="truncate text-xs text-slate-500">{programName}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {view === 'list' ? (
            isLoadingVersions ? (
              <div className="animate-pulse divide-y divide-slate-100">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 rounded bg-slate-200" />
                      <div className="h-3 w-48 rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className="flex items-center justify-center px-6 py-16 text-center">
                <p className="text-sm text-slate-500">No version history available.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => void handleSelectVersion(v.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      v{v.version}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">Version {v.version}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(v.submittedAt)}
                        {v.submittedBy && (
                          <>
                            {' · '}
                            {v.submittedBy.name}
                            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                              {ROLE_LABEL[v.submittedBy.role] ?? v.submittedBy.role}
                            </span>
                          </>
                        )}
                      </p>
                      <DiffTags tags={diffMap[v.id] ?? []} amountLabel={amountLabel} />
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )
          ) : (
            /* Snapshot view */
            <div>
              {/* Version meta bar */}
              {selectedVersion && (
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {formatDatetime(selectedVersion.submittedAt)}
                  </div>
                  {selectedVersion.submittedBy && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      {selectedVersion.submittedBy.name}
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        {ROLE_LABEL[selectedVersion.submittedBy.role] ??
                          selectedVersion.submittedBy.role}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isLoadingSnapshot ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                </div>
              ) : snapshotError ? (
                <div className="flex items-center justify-center px-6 py-12 text-center">
                  <p className="text-sm text-red-600">{snapshotError}</p>
                </div>
              ) : selectedVersion ? (
                <>
                  {changesMap[selectedVersion.id] ? (
                    <ChangesPanel
                      changes={changesMap[selectedVersion.id].changes}
                      sinceVersion={changesMap[selectedVersion.id].since}
                      amountLabel={amountLabel}
                    />
                  ) : selectedVersion.version === 1 ? (
                    <p className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
                      The first published version.
                    </p>
                  ) : null}
                  <SnapshotView
                    snapshot={selectedVersion.snapshot}
                    amountLabel={amountLabel}
                    rowStatus={changesMap[selectedVersion.id]?.changes.rowStatus}
                  />
                </>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
