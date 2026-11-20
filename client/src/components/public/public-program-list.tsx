'use client';

import { AIPMasterList, type AIPEntry } from '@/components/aip/aip-master-list';
import type { PublicListActivity, PublicListItem } from '@/lib/public-registry-list';

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function toActivityEntry(
  pa: PublicListActivity,
  programFinishLineId?: string,
  programFinishLineName?: string,
  programFinishLineVisionNumber?: number | null,
): AIPEntry {
  return {
    id: pa.id,
    program_name: pa.name,
    program_code: pa.aipReferenceCode ?? pa.tentativeAipReferenceCode,
    ppa_type: pa.type === 'PROJECT' ? 'Project' : 'Activity',
    status: 'Approved',
    primary_finish_line_id: programFinishLineId,
    finishLineName: programFinishLineName,
    finishLineVisionNumber: programFinishLineVisionNumber ?? null,
    expected_output_mfo: null,
    parent_id: pa.parentProjectActivityId ?? undefined,
    ps_amount: pa.psTotal,
    mooe_amount: pa.mooeTotal,
    fe_amount: pa.feTotal,
    co_amount: pa.coTotal,
    total_amount: pa.grandTotal,
    proposedBudget: pa.proposedBudget ?? null,
    costMode: pa.type === 'PROJECT' ? pa.costMode : undefined,
    children: [],
  };
}

function buildActivityTree(
  pas: PublicListActivity[],
  programFinishLineId?: string,
  programFinishLineName?: string,
  programFinishLineVisionNumber?: number | null,
): AIPEntry[] {
  const nodes = new Map<string, AIPEntry>();
  const sorted = [...pas].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const pa of sorted) {
    nodes.set(pa.id, toActivityEntry(pa, programFinishLineId, programFinishLineName, programFinishLineVisionNumber));
  }

  const roots: AIPEntry[] = [];
  for (const pa of sorted) {
    const node = nodes.get(pa.id);
    if (!node) continue;
    if (pa.parentProjectActivityId) {
      const parent = nodes.get(pa.parentProjectActivityId);
      if (parent) {
        parent.children = [...(parent.children ?? []), node];
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

export function mapPublicItemsToAIPEntries(items: PublicListItem[]): AIPEntry[] {
  return items.map((item) => {
    const aipCode = item.aipReferenceCode ?? item.tentativeAipReferenceCode ?? '';
    const children = buildActivityTree(
      item.projectActivities ?? [],
      item.finishLine?.id,
      item.finishLine?.name,
      item.finishLine?.visionNumber,
    );

    return {
      id: item.id,
      program_name: item.name,
      program_code: item.aipReferenceCode ?? item.tentativeAipReferenceCode ?? '',
      ppa_type: 'Program' as const,
      status: item.status === 'APPROVED' ? ('Approved' as const) : ('Draft' as const),
      status_label: item.status === 'APPROVED' ? ('Approved' as const) : ('Under Review' as const),
      primary_finish_line_id: item.finishLine?.id,
      finishLineName: item.finishLine?.name,
      finishLineVisionNumber: item.finishLine?.visionNumber ?? null,
      expected_output_mfo: null,
      ps_amount: item.psTotal,
      mooe_amount: item.mooeTotal,
      fe_amount: item.feTotal,
      co_amount: item.coTotal,
      total_amount: item.grandTotal,
      // `proposedTotal` is the program's figure either way: it already equals
      // the sum of its root PAs when it has them, and is the only figure it has
      // when it states its own costs. Re-summing the PAs here would just be a
      // slower way to get the same number — and ₱0.00 for a direct-cost program.
      proposedBudget: parseFloat(item.grandTotal) > 0
        ? item.grandTotal
        : (item.proposedTotal ?? '0.00'),
      papClass: item.papClass ?? null,
      office_id: item.office?.id ?? null,
      office_name: item.office?.name ?? null,
      office_acronym: item.office?.acronym ?? null,
      // Set only on a component program: it decides which office band the row
      // prints in, while office_* stays the office that owns the program.
      host_office_id: item.hostOffice?.id ?? null,
      host_office_name: item.hostOffice?.name ?? null,
      host_office_acronym: item.hostOffice?.acronym ?? null,
      lastUpdatedAt: item.lastUpdatedAt,
      feedbackCount: item.feedbackCount,
      specialFunds: item.fundSources,
      children,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PublicProgramListProps {
  items: PublicListItem[];
  total: number;
  totalBudget?: string;
  /** Drives office auto-expansion; the server has already filtered on it. */
  searchTerm?: string;
  totalFinishLineCount?: number;
  isLoading?: boolean;
  onViewProgram: (id: string) => void;
  onViewProject?: (id: string) => void;
  onViewActivity?: (id: string) => void;
  /** Fired when an office band is opened. */
  onExpandOffice?: () => void;
  /** "Estimated Cost" or "Appropriation" (`AMOUNT_LABEL`). */
  amountLabel: string;
}

export function PublicProgramList({
  items,
  total,
  totalBudget,
  searchTerm,
  totalFinishLineCount,
  isLoading,
  onViewProgram,
  onViewProject,
  onViewActivity,
  onExpandOffice,
  amountLabel,
}: PublicProgramListProps) {
  if (isLoading) {
    return <PublicProgramListSkeleton />;
  }

  const entries = mapPublicItemsToAIPEntries(items);

  return (
    <AIPMasterList
      data={entries}
      hasActiveFilters={false}
      searchTerm={searchTerm}
      showBreakdown={false}
      showTotal={false}
      showStatus={false}
      showLastUpdated={true}
      showTypeBadge={true}
      showFeedbackCount={true}
      proposedLabel={amountLabel}
      aggregateTotals={totalBudget ? { ps: '0', mooe: '0', fe: '0', co: '0', total: totalBudget } : undefined}
      useProposedTotals
      totalFinishLineCount={totalFinishLineCount}
      disableAutoExpand
      // Office, then the three appropriation sections inside it — the way the
      // city's printed budget reads. The whole cycle is fetched in one request
      // because grouping is only correct over the complete set, which is also
      // why no pagination props are passed: `onPageChange` is what renders the
      // pager, and a page boundary would cut an office band in half.
      groupByOffice
      // A component program sits in its host office's band, so the header names
      // an office that does not own it. The column comes back for those rows.
      showOfficeOnComponents
      onViewProgram={onViewProgram}
      onViewProject={onViewProject}
      onViewActivity={onViewActivity}
      onExpandOffice={onExpandOffice}
      totalItems={total}
    />
  );
}

function PublicProgramListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-3">
          <div className="h-4 w-2/5 rounded bg-tbl-fill-deep" />
          <div className="h-6 w-10 rounded-full bg-tbl-fill-deep" />
          <div className="h-3.5 w-24 rounded bg-tbl-fill-deep" />
          <div className="ml-auto h-3.5 w-20 rounded bg-tbl-fill-deep" />
        </div>
      ))}
    </div>
  );
}
