import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getSession, hasPermission } from '@/lib/session';
import {
  apiGetBudgetDocument,
  apiGetBudgetDocumentAudit,
  apiListBudgetItems,
  apiListBudgetObjectLines,
  apiCompareBudgetDocument,
  type BudgetDocumentAuditRecord,
  type BudgetDocumentComparison,
  type BudgetItemRecord,
  type BudgetObjectLineRecord,
  type BudgetOfficeHeaderRecord,
} from '@/lib/api';
import { addDecimalStrings, formatPeso } from '@/lib/currency-formatter';
import { officeGroups } from '@/lib/budget-document-tree';
import { sourceLabel } from '@/lib/source-label';
import { sourcePdfHref } from '@/lib/source-pdf';
import type { SourceLink } from '@/lib/api';
import { KIND_LABEL, STATUS_COLOR, STATUS_LABEL, formatDate } from '../../../_labels';
import { AcknowledgeButton, FinalizeButton } from './_review-actions';
import { AllocablePanel } from './_allocable';
import { SourceViewer, SourceViewerLayout } from './_source-viewer';

const TABS = [
  { key: 'ppa', label: 'By PPA' },
  { key: 'objects', label: 'By object of expenditure' },
  { key: 'review', label: 'Import review' },
  { key: 'compare', label: 'Compare with the year before' },
  { key: 'history', label: 'History' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const AUDIT_LABEL: Record<string, string> = {
  IMPORTED: 'Imported',
  EDITED: 'Edited',
  ACKNOWLEDGED: 'Import warning reviewed',
  FINALIZED: 'Finalized',
  RETIRED_SOURCE: 'Old program rows retired',
  RESTORED_SOURCE: 'Old program rows restored',
  COMMENT: 'Comment',
};

const isZero = (v: string) => /^0*(\.0*)?$/.test(v);
const money = (v: string) => (isZero(v) ? '—' : formatPeso(v));

/**
 * One LEP or Ordinance (specs/012 P4): its PPAs, its object-of-expenditure
 * lines, the rows the import flagged, and its history. A DRAFT can be reviewed
 * and finalized here; after that it is frozen.
 */
export default async function BudgetDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ year, id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) redirect('/login');
  if (!hasPermission(session.user, 'budget:read')) redirect('/budget-cycles');
  const token = session.accessToken;

  const doc = await apiGetBudgetDocument(token, id).catch(() => null);
  if (!doc) notFound();
  const fy = doc.budgetCycle.fiscalYear;
  if (String(fy) !== year) redirect(`/budget-cycles/${fy}/documents/${id}`);

  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : 'ppa';
  const [items, lines, audit, comparison] = await Promise.all([
    tab === 'objects' || tab === 'compare'
      ? null
      : apiListBudgetItems(token, id).catch(() => [] as BudgetItemRecord[]),
    tab === 'objects'
      ? apiListBudgetObjectLines(token, id).catch(() => [] as BudgetObjectLineRecord[])
      : null,
    tab === 'history'
      ? apiGetBudgetDocumentAudit(token, id).catch(() => [] as BudgetDocumentAuditRecord[])
      : null,
    tab === 'compare' ? apiCompareBudgetDocument(token, id).catch(() => null) : null,
  ]);
  const canReview = doc.status === 'DRAFT' && hasPermission(session.user, 'budget:write');
  const base = `/budget-cycles/${fy}/documents/${id}`;
  const detail = doc.ordinanceDetail;

  return (
    <SourceViewerLayout>
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          href="/budget-cycles"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Budget documents
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-neutral-900">
            FY{fy} {KIND_LABEL[doc.kind]}
          </h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[doc.status]}`}>
            {STATUS_LABEL[doc.status]}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Fact label="Total (by PPA)" value={formatPeso(doc.total)} />
          <Fact label="PPAs" value={String(doc._count.items)} />
          <Fact label="Object lines" value={String(doc._count.objectLines)} />
          <Fact label="Finalized" value={formatDate(doc.finalizedAt)} />
          {detail?.ordinanceNumber && <Fact label="Ordinance No." value={detail.ordinanceNumber} />}
          {detail?.passedAt && <Fact label="Passed" value={formatDate(detail.passedAt)} />}
          {detail?.approvedAt && <Fact label="Approved" value={formatDate(detail.approvedAt)} />}
          {doc.sourceDocumentName && <Fact label="Source file" value={doc.sourceDocumentName} />}
        </dl>
      </div>

      {doc.kind === 'LEP' && (
        <AllocablePanel
          documentId={doc.id}
          allocable={doc.lepDetail?.allocableTotal ?? null}
          total={doc.total}
          over={doc.overAllocable}
          canEdit={canReview}
        />
      )}

      {canReview && (
        <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-700 mb-1">
            {doc.kind === 'ORDINANCE' ? 'Enact' : 'Submit'}
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            {doc.kind === 'ORDINANCE'
              ? 'Enact once the Local Chief Executive has approved the Ordinance (signed, or the 10 days lapsed).'
              : 'Submit once the Local Chief Executive has sent the LEP to the Sanggunian.'}
          </p>
          <FinalizeButton
            documentId={doc.id}
            kind={doc.kind}
            fiscalYear={fy}
            blocked={doc.flaggedItemCount}
          />
        </div>
      )}

      <nav className="flex gap-1 border-b border-neutral-200" aria-label="Document views">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'ppa' ? base : `${base}?tab=${t.key}`}
            aria-current={t.key === tab ? 'page' : undefined}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              t.key === tab
                ? 'border-blue-600 text-blue-700 font-medium'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
            {t.key === 'review' && doc.flaggedItemCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
                {doc.flaggedItemCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === 'ppa' && items && <PpaTable items={items} headers={doc.officeHeaders} />}
      {tab === 'objects' && lines && <ObjectTable lines={lines} />}
      {tab === 'review' && items && (
        <ReviewList
          documentId={doc.id}
          items={items.filter((i) => i.importWarnings.length > 0)}
          canReview={canReview}
        />
      )}
      {tab === 'history' && audit && <History rows={audit} items={items ?? []} />}
      {tab === 'compare' && <Comparison c={comparison} />}
    </div>
    </SourceViewerLayout>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-neutral-900 tabular-nums break-words">{value}</dd>
    </div>
  );
}

function PpaTable({ items, headers = [] }: { items: BudgetItemRecord[]; headers?: BudgetOfficeHeaderRecord[] }) {
  if (items.length === 0) return <Empty text="No PPAs in your offices." />;
  const headerOf = new Map(headers.map((h) => [h.officeId, h]));
  const showFe = items.some((i) => !isZero(i.fe));
  const showUnsplit = items.some((i) => !isZero(i.unsplit));
  const groups = officeGroups(items);
  const cols = 4 + (showFe ? 1 : 0) + (showUnsplit ? 1 : 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        PS, MOOE{showFe ? ', FE' : ''} and CO{showUnsplit ? ' (and money stated only as a total)' : ''} are
        each PPA&apos;s own amounts. Total includes the PPAs under it.
      </p>
      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">PPA</th>
              <th className="px-3 py-2 font-medium text-right">PS</th>
              <th className="px-3 py-2 font-medium text-right">MOOE</th>
              {showFe && <th className="px-3 py-2 font-medium text-right">FE</th>}
              <th className="px-3 py-2 font-medium text-right">CO</th>
              {showUnsplit && <th className="px-3 py-2 font-medium text-right">Unsplit</th>}
              <th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {groups.map((g) => [
              <tr key={g.office.id} className="bg-neutral-100/70">
                <td className="px-3 py-2 font-semibold text-neutral-800" colSpan={cols}>
                  {g.office.acronym}{' '}
                  <span className="font-normal text-neutral-500">{g.office.name}</span>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                  {formatPeso(addDecimalStrings(g.roots.map((r) => r.total)))}
                </td>
              </tr>,
              ...(headerOf.has(g.office.id)
                ? [<OfficeHeaderRow key={`${g.office.id}-header`} header={headerOf.get(g.office.id)!} cols={cols + 1} />]
                : []),
              ...g.rows.map(({ item: i, depth }) => (
                <tr key={i.id} className="align-top">
                  <td className="px-3 py-2" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
                    <div className={depth === 0 ? 'font-medium text-neutral-900' : 'text-neutral-800'}>
                      {i.name}
                      {i.importWarnings.length > 0 && (
                        <span
                          title={i.importWarnings.join('\n')}
                          className="ml-1.5 rounded bg-amber-100 px-1 text-[0.6875rem] text-amber-800"
                        >
                          needs review
                        </span>
                      )}
                    </div>
                    {(i.aipReferenceCode || i.source) && (
                      <div className="text-xs text-neutral-400">
                        {i.aipReferenceCode && <span className="font-mono">{i.aipReferenceCode}</span>}
                        {i.aipReferenceCode && i.source && ' · '}
                        <Source source={i.source} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(i.ps)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(i.mooe)}</td>
                  {showFe && <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(i.fe)}</td>}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(i.co)}</td>
                  {showUnsplit && (
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(i.unsplit)}</td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium">{formatPeso(i.total)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ObjectTable({ lines }: { lines: BudgetObjectLineRecord[] }) {
  if (lines.length === 0) return <Empty text="This document has no object-of-expenditure lines." />;
  const offices = new Map<string, BudgetObjectLineRecord[]>();
  for (const l of lines) offices.set(l.officeId, [...(offices.get(l.officeId) ?? []), l]);
  const grouped = [...offices.values()].sort((a, b) =>
    a[0].office.acronym.localeCompare(b[0].office.acronym),
  );
  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Account code</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Class</th>
            <th className="px-3 py-2 font-medium">Fund</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {grouped.map((rows) => [
            <tr key={rows[0].officeId} className="bg-neutral-100/70">
              <td className="px-3 py-2 font-semibold text-neutral-800" colSpan={5}>
                {rows[0].office.acronym}{' '}
                <span className="font-normal text-neutral-500">{rows[0].office.name}</span>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                {formatPeso(addDecimalStrings(rows.map((r) => r.amount)))}
              </td>
            </tr>,
            ...rows.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-600">{l.uacsCode}</td>
                <td className="px-3 py-2 text-neutral-800">{l.accountTitle ?? '—'}</td>
                <td className="px-3 py-2 text-neutral-600">{l.expenseClass}</td>
                <td className="px-3 py-2 text-neutral-600">{l.fundSource ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">
                  <Source source={l.source} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatPeso(l.amount)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function ReviewList({
  documentId,
  items,
  canReview,
}: {
  documentId: string;
  items: BudgetItemRecord[];
  canReview: boolean;
}) {
  if (items.length === 0) return <Empty text="Every imported PPA has been reviewed." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        The import made a call on these rows that nothing in the file can confirm. Check each
        against the printed Ordinance, then mark it reviewed. A wrong row is fixed by re-importing
        while the document is a draft.
      </p>
      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{i.name}</p>
              <p className="text-xs text-neutral-500">
                {i.office.acronym}
                {i.aipReferenceCode && <span className="font-mono"> · {i.aipReferenceCode}</span>}
                {' · '}
                {formatPeso(i.total)}
              </p>
              {i.source && (
                <p className="text-xs text-neutral-500">
                  Check it in {i.source.file}: <Source source={i.source} />
                </p>
              )}
              <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-800 space-y-0.5">
                {i.importWarnings.map((w, n) => (
                  <li key={n}>{w}</li>
                ))}
              </ul>
            </div>
            {canReview && <AcknowledgeButton documentId={documentId} itemId={i.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({
  rows,
  items,
}: {
  rows: BudgetDocumentAuditRecord[];
  items: BudgetItemRecord[];
}) {
  if (rows.length === 0) return <Empty text="No history yet." />;
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <p className="text-sm text-neutral-900">
            <span className="font-medium">{AUDIT_LABEL[r.action] ?? r.action}</span>
            {r.itemId && nameOf.has(r.itemId) && (
              <span className="text-neutral-600"> · {nameOf.get(r.itemId)}</span>
            )}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'Import script'} ·{' '}
            {new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <DetailLine detail={r.detail} />
        </li>
      ))}
    </ul>
  );
}

/** The audit detail as short `key: value` pairs; lists show their length. */
function DetailLine({ detail }: { detail: Record<string, unknown> }) {
  const parts = Object.entries(detail ?? {})
    .map(([k, v]) =>
      Array.isArray(v)
        ? v.length > 0 && v.every((x) => typeof x === 'string') && v.length <= 3
          ? `${k}: ${v.join('; ')}`
          : `${k}: ${v.length}`
        : v !== null && typeof v === 'object'
          ? null
          : `${k}: ${String(v)}`,
    )
    .filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="text-xs text-neutral-400 mt-1 break-words">{parts.join(' · ')}</p>;
}

/** Where an imported row came from; a city portal scan opens beside the table, any other hosted file in a new tab. */
function Source({ source }: { source?: SourceLink | null }) {
  if (!source) return null;
  const label = sourceLabel(source) || source.file;
  const pdf = sourcePdfHref(source);
  if (pdf) return <SourceViewer source={source} label={label} href={pdf} />;
  return source.url ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.file} className="underline hover:text-neutral-700">
      {label}
    </a>
  ) : (
    <span title={source.file}>{label}</span>
  );
}

/** The office's mandate, vision, mission and outcomes as this book prints them (specs/017). */
function OfficeHeaderRow({ header: h, cols }: { header: BudgetOfficeHeaderRecord; cols: number }) {
  const fields = [
    ['Mandate / legal basis', h.mandateLegalBasis],
    ['Vision', h.vision],
    ['Mission', h.mission],
    ['Organizational outcome', h.organizationalOutcomes.join(' · ') || null],
  ] as const;
  return (
    <tr className="bg-neutral-50/60">
      <td colSpan={cols} className="px-3 py-1.5">
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer select-none text-neutral-500 hover:text-neutral-800">
            Mandate, vision and mission as printed{h.source ? <> · <Source source={h.source} /></> : null}
          </summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[12rem_1fr]">
            {fields.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-medium text-neutral-500">{label}</dt>
                <dd className={value ? 'text-neutral-800' : 'italic text-neutral-400'}>{value ?? 'Not read'}</dd>
              </div>
            ))}
          </dl>
        </details>
      </td>
    </tr>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-5 py-8 text-center text-sm text-neutral-500">
      {text}
    </p>
  );
}

/**
 * Each line's "current year" column (the book's estimate of the year before)
 * against the year before's own budget-year figure (specs/017 FR-010). A
 * difference is information, not an error: the year before may have been
 * changed by the Sanggunian, or by supplemental budgets.
 */
function Comparison({ c }: { c: BudgetDocumentComparison | null }) {
  if (!c) return <p className="text-sm text-neutral-500">The comparison could not be loaded.</p>;
  if (!c.previous)
    return <p className="text-sm text-neutral-500">FY{c.fiscalYear - 1} has no budget document to compare with.</p>;
  const prev = `FY${c.previous.fiscalYear} ${c.previous.kind === 'LEP' ? 'LEP' : 'Ordinance'}`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        This document&apos;s FY{c.fiscalYear - 1} column against the {prev}&apos;s own figure, matched by office,
        account and the LGU&apos;s sub-code. {c.counts.matched} of {c.counts.here} lines match a line there;{' '}
        {c.counts.equal} agree to the centavo and {c.counts.differ} differ (largest first).
        {c.counts.there === 0 && ` The ${prev} has no object or receipt lines yet.`}
      </p>
      {c.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Office</th>
                <th className="px-3 py-2 text-right">FY{c.fiscalYear - 1} here</th>
                <th className="px-3 py-2 text-right">{prev}</th>
                <th className="px-3 py-2 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {c.rows.map((r) => (
                <tr key={`${r.kind}|${r.scope}|${r.code}`}>
                  <td className="px-3 py-2">
                    {r.title}
                    <span className="ml-2 font-mono text-xs text-neutral-400">{r.code}</span>
                    {r.kind === 'receipt' && <span className="ml-2 text-xs text-neutral-400">receipt</span>}
                  </td>
                  <td className="px-3 py-2">{r.scope}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.thisCurrentYear ? formatPeso(r.thisCurrentYear) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.previousBudgetYear ? formatPeso(r.previousBudgetYear) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.delta ? formatPeso(r.delta) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
