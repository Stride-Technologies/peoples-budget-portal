'use server';

import { revalidatePath } from 'next/cache';
import { getSession, hasPermission } from '@/lib/session';
import {
  apiGetAipRegistry, apiGetAipCycles, apiGetProgram,
  apiGetActivityStream, apiGetComments, apiPostComment, apiGetCommentPermission, apiDeleteComment,
  apiResolveComment, apiUnresolveComment, apiGetProgramEndorsements,
  apiGetProgramApprovals, apiMarkProgramSeen,
  apiGetProjectActivity, apiGetProjectActivityStream, apiGetFinishLineCeilings, apiGetClusters,
  apiGetOfficesAll, apiGetFinishLines, apiPublicGetFeedback, apiPublicGetPAFeedback,
  apiGetOffices, apiListBudgetDocuments,
  apiGetSpecialFunds,
  apiListThematicTags,
  apiCreateThematicTag,
  closeMatchFrom,
  type ThematicTagRecord,
  type ThematicTagRef,
  type SpecialFundRecord,
  apiGetMyOfficeScope, apiGetCivilSocietyOrganizations, apiGetClustersAdmin,
  apiReviseProgram, apiPublishProgram, apiDiscardProgramDraft, apiArchiveProgram, apiUnarchiveProgram,
  apiGetPublishReadiness, apiGetProgramDraftDiff,
  apiAcknowledgeProgramImport,
  apiGetProgramEditHistory, apiGetProjectActivityEditHistory, apiGetAllEditHistory,
  apiAcknowledgeImports,
  apiPublishCluster, apiPublishPreview, apiPublishableCounts,
  type ProgramDetailRecord, type CreateCommentPayload,
  type ActivityEvent, type ProgramComment, type RegistryTab,
  type RegistryResponse, type RegistryItem, type ProgramEndorsementRecord, type ProgramApprovalRecord,
  type RegistryProjectActivity, type AipCycleRecord,
  type ProjectActivityDetailRecord, type PublicFeedbackItem,
  type PublishReadiness, type ProgramDraftDiff, type EditHistoryPage,
  type AcknowledgeImportsResult,
  type ClusterPublishResult,
  type SourceLink,
} from '@/lib/api';
import type { SessionUser } from '@/lib/session';
import type { PapClass } from '@/lib/schemas';
import { goal, goals } from '@/lib/goal-label';


// Mirrors AIPEntry from aip-master-list (avoid importing 'use client' file from server)
type AIPEntryLite = {
  id: string;
  program_name?: string;
  ppa_description?: string;
  program_code: string;
  ppa_type: 'Program' | 'Project' | 'Activity';
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  /** Humanized raw ProgramStatus for display (e.g. distinguishes HEAD_REVIEWED). */
  status_label?: "Draft" | "For Revision" | "Submitted" | "Head Reviewed" | "Pending Approval" | "Approved" | "Rejected" | "Published" | "Revision" | "Archived";
  primary_finish_line_id?: string;
  papClass?: PapClass | null;
  importWarnings?: string[];
  dataWarnings?: string[];
  archivedReason?: string | null;
  source?: SourceLink | null;
  finishLineName?: string;
  finishLineVisionNumber?: number | null;
  subFinishLineId?: string | null;
  subFinishLineName?: string | null;
  expected_output_mfo?: string | null;
  ps_amount: string;
  mooe_amount: string;
  fe_amount: string;
  co_amount: string;
  total_amount: string;
  /** Sum of projectActivity.proposedBudget for programs; own proposedBudget for PAs. */
  proposedBudget?: string | null;
  children?: AIPEntryLite[];
  parent_id?: string;
  // Additional metadata for drawer display
  office_id?: string | null;
  office_name?: string | null;  // Direct office name from API
  office_acronym?: string | null;
  /** Set on component programs — the office whose AB sheet this prints under. */
  host_office_id?: string | null;
  host_office_name?: string | null;
  host_office_acronym?: string | null;
  department_id?: string;
  departmentId?: string;
  created_date?: string;
  updated_date?: string;
  implementationStartMonth?: number | null;
  implementationStartYear?: number | null;
  implementationEndMonth?: number | null;
  implementationEndYear?: number | null;
  supportingOffices?: Array<{ id: string; name: string; acronym?: string }>;
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  /** Effective tags: own direct applications, plus a PA's parent's it doesn't already carry (`inherited: true`). Always `inherited: false` on a Program row. */
  thematicTags?: { id: string; name: string; inherited: boolean }[];
  /**
   * Owning program, on PA rows only. `parent_id` is the parent *PA* and is
   * undefined for a root project, so it can never answer "is this row's program
   * editable?" — that check needs this.
   */
  programId?: string;
};

export interface ExportClusterOption {
  id: string;
  name: string;
  fullName: string | null;
  label: string;
}

export interface ExportMenuState {
  canExportCluster: boolean;
  canChooseCluster: boolean;
  showCompleteExport: boolean;
  /** LBP Form 7 is city-wide: the API serves it only to all-offices users. */
  showForm7: boolean;
  ownClusterId: string | null;
  ownClusterLabel: string | null;
  clusterOptions: ExportClusterOption[];
}

type ExportTarget = {
  canChooseCluster: boolean;
  ownCluster: ExportClusterOption | null;
  clusterOptions: ExportClusterOption[];
};


// Coarse status drives footer/action gating; kept intentionally broad.
// PUBLISHED_REVISION buckets with 'Draft': it is a working copy the owning
// office can still edit, so gating it as 'Submitted' would lock the wrong set
// of controls. Use `isEditableProgramStatus` for anything permission-shaped.
function mapStatus(s: string): AIPEntryLite['status'] {
  if (s === 'DRAFT' || s === 'FOR_REVISION' || s === 'PUBLISHED_REVISION')
    return 'Draft';
  if (s === 'APPROVED') return 'Approved';
  if (s === 'REJECTED') return 'Rejected';
  return 'Submitted'; // SUBMITTED, HEAD_REVIEWED gate the same way
}

// Humanized raw ProgramStatus for the per-row / drawer badge — the workflow
// stage must stay visible (feedback-lifecycle plan §1).
type HumanStatus = "Draft" | "For Revision" | "Submitted" | "Head Reviewed" | "Pending Approval" | "Approved" | "Rejected" | "Published" | "Revision" | "Archived"

/**
 * The published states must be listed here. Falling through to `default` leaked
 * the raw `"PUBLISHED_REVISION"` string, which then matched none of the
 * humanized literals downstream and silently disabled every edit control on a
 * program that was in fact editable.
 *
 * "Revision" matches the registry's own "Revisions" tab
 * (`aip-registry-tabs.tsx`) and `LABEL_TO_KEY` in `lib/program-status.ts`.
 */
function humanizeStatus(s: string): HumanStatus {
  switch (s) {
    case 'DRAFT': return 'Draft';
    case 'FOR_REVISION': return 'For Revision';
    case 'SUBMITTED': return 'Submitted';
    case 'HEAD_REVIEWED': return 'Head Reviewed';
    case 'PENDING_APPROVAL': return 'Pending Approval';
    case 'APPROVED': return 'Approved';
    case 'REJECTED': return 'Rejected';
    case 'PUBLISHED': return 'Published';
    case 'PUBLISHED_REVISION': return 'Revision';
    case 'ARCHIVED': return 'Archived';
    default: return s as HumanStatus;
  }
}

function formatClusterLabel(cluster: {
  name: string;
  fullName: string | null;
}): string {
  return cluster.fullName ? `${cluster.name} — ${cluster.fullName}` : cluster.name;
}

function mapClusterOption(cluster: {
  id: string;
  name: string;
  fullName: string | null;
}): ExportClusterOption {
  return {
    id: cluster.id,
    name: cluster.name,
    fullName: cluster.fullName,
    label: formatClusterLabel(cluster),
  };
}

async function resolveExportTarget(
  user: SessionUser,
  accessToken: string,
): Promise<ExportTarget> {
  if (user.role === 'SUPER_ADMIN') {
    const clusters = await apiGetClustersAdmin(accessToken);
    return {
      canChooseCluster: true,
      ownCluster: null,
      clusterOptions: clusters.map(mapClusterOption),
    };
  }

  if (user.identityType === 'LFC') {
    const clusters = await apiGetClusters(accessToken);
    return {
      canChooseCluster: true,
      ownCluster: null,
      clusterOptions: clusters.map(mapClusterOption),
    };
  }

  if (user.identityType === 'LGU' && user.officeId) {
    // Every cluster the caller's *scope* reaches, not just their home office's.
    //
    // This used to offer exactly one cluster, derived from `user.officeId`, so a
    // CPDO encoder granted the eight Economy offices was offered "Governance" —
    // the cluster CPDO happens to sit in — and had no way to reach the offices
    // they actually work on. Scope is what an admin assigned; the home office is
    // just where the person sits.
    const [offices, scope] = await Promise.all([
      apiGetOffices(accessToken),
      apiGetMyOfficeScope(accessToken),
    ]);

    // `effectiveOfficeIds` already unions the grants with the home office, so a
    // user with no grants keeps exactly the one cluster they had before, and a
    // granted user gets their own office's cluster too — they can still read and
    // export the programs they file themselves.
    const inScope = scope.allOffices
      ? offices
      : offices.filter((office) => scope.officeIds.includes(office.id));

    // Dedupe by cluster id, keeping the offices' own order.
    const byCluster = new Map<string, ExportClusterOption>();
    for (const office of inScope) {
      if (office.cluster && !byCluster.has(office.cluster.id)) {
        byCluster.set(office.cluster.id, mapClusterOption(office.cluster));
      }
    }
    const clusterOptions = [...byCluster.values()];

    // The home office's cluster stays the default *when the scope reaches it*,
    // so a user with no grants sees exactly what they saw before.
    const homeOffice = offices.find(
      (candidate) => candidate.id === user.officeId,
    );
    const homeCluster =
      homeOffice?.cluster && byCluster.has(homeOffice.cluster.id)
        ? mapClusterOption(homeOffice.cluster)
        : null;

    return {
      // A picker only helps when there is more than one thing to pick.
      canChooseCluster: clusterOptions.length > 1,
      ownCluster: homeCluster ?? clusterOptions[0] ?? null,
      clusterOptions,
    };
  }

  if (user.identityType === 'NCPC' && user.civilSocietyOrganizationId) {
    const csos = await apiGetCivilSocietyOrganizations(accessToken);
    const cso = csos.find(
      (candidate) => candidate.id === user.civilSocietyOrganizationId,
    );
    const ownCluster = cso ? mapClusterOption(cso.cluster) : null;
    return {
      canChooseCluster: false,
      ownCluster,
      clusterOptions: ownCluster ? [ownCluster] : [],
    };
  }

  return {
    canChooseCluster: false,
    ownCluster: null,
    clusterOptions: [],
  };
}

/**
 * Phase 1 D17: line-item entry is deferred, so the `*Total` rollups are
 * structurally 0 for anything captured through the current form. Prefer the
 * proposed/estimate family and keep the rollup as the fallback for legacy rows
 * imported with line items.
 */
function amount(proposed: string | null | undefined, rollup: string | undefined) {
  return proposed ?? (rollup || '0');
}

function toAipEntry(p: RegistryItem): AIPEntryLite {
  return {
    id: p.id,
    program_name: p.name,
    program_code: p.aipReferenceCode ?? p.tentativeAipReferenceCode,
    ppa_type: 'Program',
    status: mapStatus(p.status),
    status_label: humanizeStatus(p.status),
    primary_finish_line_id: p.finishLineId,
    papClass: p.papClass ?? null,
    importWarnings: p.importWarnings ?? [],
    archivedReason: p.archivedReason ?? null,
    dataWarnings: p.dataWarnings ?? [],
    source: p.source ?? null,
    finishLineName: p.finishLine?.name ?? `No ${goal}`,
    finishLineVisionNumber: p.finishLine?.visionNumber ?? null,
    subFinishLineId: p.subFinishLineId ?? null,
    subFinishLineName: p.subFinishLine?.name ?? null,
    expected_output_mfo: p.expectedOutput ?? null,
    ps_amount: amount(p.psProposedTotal, p.psTotal),
    mooe_amount: amount(p.mooeProposedTotal, p.mooeTotal),
    fe_amount: amount(p.feProposedTotal, p.feTotal),
    co_amount: amount(p.coProposedTotal, p.coTotal),
    total_amount: amount(p.proposedTotal, p.grandTotal),
    proposedBudget: p.projectActivities
      .filter((pa) => pa.parentProjectActivityId === null)
      .reduce((sum, pa) => sum + parseFloat(pa.proposedBudget ?? '0'), 0)
      .toFixed(2),
    office_id: p.officeId || null,
    office_name: p.office?.name || null,  // Get office name from API object
    office_acronym: p.office?.acronym || null,
    host_office_id: p.hostOffice?.id || null,
    host_office_name: p.hostOffice?.name || null,
    host_office_acronym: p.hostOffice?.acronym || null,
    created_date: p.createdAt,
    updated_date: p.updatedAt,
    implementationStartMonth: p.implementationStartMonth,
    implementationStartYear: p.implementationStartYear,
    implementationEndMonth: p.implementationEndMonth,
    implementationEndYear: p.implementationEndYear,
    supportingOffices: p.supportingOffices,
    thematicTags: p.thematicTags,
  };
}

function toActivityEntry(
  activity: RegistryProjectActivity,
  metadata?: Pick<
    AIPEntryLite,
    'office_id' | 'office_name' | 'office_acronym' | 'primary_finish_line_id' | 'finishLineName' | 'finishLineVisionNumber' | 'programId'
  >,
  programStatus?: AIPEntryLite['status'],
  programStatusLabel?: HumanStatus,
): AIPEntryLite {
  return {
    id: activity.id,
    program_name: activity.name,
    program_code: activity.aipReferenceCode ?? activity.tentativeAipReferenceCode,
    ppa_type: activity.type === 'PROJECT' ? 'Project' : 'Activity',
    status: programStatus ?? 'Submitted',
    status_label: programStatusLabel,
    primary_finish_line_id: metadata?.primary_finish_line_id,
    finishLineName: metadata?.finishLineName,
    finishLineVisionNumber: metadata?.finishLineVisionNumber ?? null,
    expected_output_mfo: activity.expectedOutput ?? null,
    source: activity.source ?? null,
    parent_id: activity.parentProjectActivityId ?? undefined,
    ps_amount: amount(activity.psEstimate, activity.psTotal),
    mooe_amount: amount(activity.mooeEstimate, activity.mooeTotal),
    fe_amount: amount(activity.feEstimate, activity.feTotal),
    co_amount: amount(activity.coEstimate, activity.coTotal),
    total_amount: amount(activity.proposedBudget, activity.grandTotal),
    proposedBudget: activity.proposedBudget ?? null,
    office_id: metadata?.office_id ?? null,
    office_name: metadata?.office_name ?? null,
    costMode: activity.type === 'PROJECT' ? activity.costMode : undefined,
    programId: metadata?.programId,
    thematicTags: activity.thematicTags,
    children: [],
  };
}

function buildActivityTree(
  projectActivities: RegistryProjectActivity[],
  metadata?: Pick<
    AIPEntryLite,
    'office_id' | 'office_name' | 'office_acronym' | 'primary_finish_line_id' | 'finishLineName' | 'finishLineVisionNumber' | 'programId'
  >,
  programStatus?: AIPEntryLite['status'],
  programStatusLabel?: HumanStatus,
): AIPEntryLite[] {
  if (!Array.isArray(projectActivities)) return [];
  const nodes = new Map<string, AIPEntryLite>();
  const roots: AIPEntryLite[] = [];

  for (const activity of [...projectActivities].sort((left, right) => (left.orderIndex || 0) - (right.orderIndex || 0))) {
    nodes.set(activity.id, toActivityEntry(activity, metadata, programStatus, programStatusLabel));
  }

  for (const activity of [...projectActivities].sort((left, right) => (left.orderIndex || 0) - (right.orderIndex || 0))) {
    const node = nodes.get(activity.id);
    if (!node) continue;

    const parentId = activity.parentProjectActivityId;
    if (parentId) {
      const parent = nodes.get(parentId);
      if (parent) {
        parent.children = [...(parent.children ?? []), node];
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
}

export async function loadAipCycles(): Promise<AipCycleRecord[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetAipCycles(session.accessToken);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load AIP cycles.' };
  }
}

export async function loadCycleCeiling(cycleId: string): Promise<number | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const ceilings = await apiGetFinishLineCeilings(session.accessToken, cycleId);
    return ceilings.reduce((sum, c) => sum + parseFloat(c.totalCeiling), 0);
  } catch {
    return null;
  }
}

export async function loadClusters(): Promise<{ id: string; name: string; offices: { id: string; name: string; acronym: string }[] }[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const clusters = await apiGetClusters(session.accessToken);
    return clusters.map((c) => ({
      id: c.id,
      name: c.name,
      offices: c.offices.map((o) => ({ id: o.id, name: o.name, acronym: o.acronym })),
    }));
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load clusters.' };
  }
}

export async function loadExportMenuState(): Promise<
  ExportMenuState | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const target = await resolveExportTarget(session.user, session.accessToken);
    return {
      canExportCluster:
        target.canChooseCluster || target.ownCluster !== null,
      canChooseCluster: target.canChooseCluster,
      showCompleteExport:
        session.user.role === 'SUPER_ADMIN' || session.user.identityType === 'LFC',
      showForm7:
        session.user.role === 'SUPER_ADMIN' || session.user.allOfficesScope === true,
      ownClusterId: target.ownCluster?.id ?? null,
      ownClusterLabel: target.ownCluster?.label ?? null,
      clusterOptions: target.clusterOptions,
    };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to load export options.',
    };
  }
}

export async function loadOffices(): Promise<{ id: string; name: string; acronym: string }[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const offices = await apiGetOfficesAll(session.accessToken);
    return offices.map((o) => ({ id: o.id, name: o.name, acronym: o.acronym }));
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load offices.' };
  }
}

export async function loadFinishLines(): Promise<{ id: string; name: string; visionNumber: number | null }[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const lines = await apiGetFinishLines(session.accessToken);
    return lines.map((fl) => ({ id: fl.id, name: fl.name, visionNumber: fl.visionNumber ?? null }));
  } catch (err) {
    return { error: (err as Error).message ?? `Failed to load ${goals}.` };
  }
}

export async function loadThematicTagCatalog(): Promise<
  { catalog: ThematicTagRecord[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const catalog = await apiListThematicTags(session.accessToken);
    return { catalog };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load the thematic tag catalog.' };
  }
}

/**
 * Create-by-name for the filter bar's "Create …" row. The combobox already
 * shows every matching catalog name live as the admin types, so the
 * close-match prompt the inline tag picker needs is redundant here —
 * `confirmNew` goes straight through; a genuine exact-name collision still
 * 409s and is surfaced as a plain error.
 */
export async function createThematicTagForFilter(
  name: string,
): Promise<{ tag: ThematicTagRef } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is required.' };
  try {
    const tag = await apiCreateThematicTag(session.accessToken, { name: trimmed, confirmNew: true });
    return { tag };
  } catch (err) {
    const closeMatch = closeMatchFrom(err);
    if (closeMatch) return { error: `Already exists as "${closeMatch.name}".` };
    return { error: (err as Error).message ?? 'Failed to create the tag.' };
  }
}

export async function loadAipRegistry(params?: {
  tab?: RegistryTab;
  cycleId?: string;
  clusterId?: string;
  finishLineIds?: string[];
  officeId?: string;
  search?: string;
  thematicTagIds?: string[];
  page?: number;
  pageSize?: number;
}): Promise<
  | {
      entries: AIPEntryLite[];
      rawStatus: Record<string, string>;
      tabCounts: RegistryResponse['tabCounts'];
      unreadIds: string[];
      total: number;
      page: number;
      aggregateTotals: RegistryResponse['aggregateTotals'];
    }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    // Single request: the registry list now embeds each program's project /
    // activity rows with their denormalized PS/MOOE/FE/CO rollups, so the tree is
    // built without a per-program or per-activity detail fetch.
    const result = await apiGetAipRegistry(session.accessToken, {
      tab: params?.tab ?? 'ALL',
      cycleId: params?.cycleId,
      clusterId: params?.clusterId,
      finishLineIds: params?.finishLineIds,
      officeId: params?.officeId,
      search: params?.search || undefined,
      thematicTagIds: params?.thematicTagIds,
      page: params?.page ?? 1,
      // No default worth having: the staff registry asks for a whole cycle so it
      // can group by office, and any caller wanting a page must say how big.
      pageSize: params?.pageSize ?? 25,
    });
    const entries = result.items.map((program) => {
      const entry = toAipEntry(program);
      entry.children = buildActivityTree(
        program.projectActivities,
        {
          office_id: entry.office_id,
          office_name: entry.office_name,
          primary_finish_line_id: entry.primary_finish_line_id,
          finishLineName: entry.finishLineName,
          finishLineVisionNumber: entry.finishLineVisionNumber,
          programId: entry.id,
        },
        entry.status,
        entry.status_label,
      );
      return entry;
    });
    const rawStatus: Record<string, string> = {};
    for (const p of result.items) rawStatus[p.id] = p.status;
    const unreadIds = result.items
      .filter((p) => p.hasUnread)
      .map((p) => p.id);
    return { entries, rawStatus, tabCounts: result.tabCounts, unreadIds, total: result.total, page: result.page, aggregateTotals: result.aggregateTotals };
  } catch (err) {
    console.error('Failed to load AIP registry:', err);
    return { error: (err as Error).message ?? 'Failed to load registry.' };
  }
}


export async function getCurrentUserRole(): Promise<
  {
    role: string;
    userId: string;
    officeId: string | null;
    isLfcMember: boolean;
    /** Phase 1: what the UI offers. The API re-checks every request. */
    canPublish: boolean;
    canWrite: boolean;
    canAudit: boolean;
  } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  const role = session.user.role;
  return {
    role,
    userId: session.user.sub,
    officeId: session.user.officeId,
    // Phase 1 has no LFC surface (§3.5); retained in the shape so the Phase 2
    // restore does not have to thread it back through every caller.
    isLfcMember: false,
    canPublish: hasPermission(session.user, 'aip:publish'),
    canWrite: hasPermission(session.user, 'aip:write'),
    canAudit: hasPermission(session.user, 'aip:audit'),
  };
}
export async function loadActivityStream(
  programId: string,
): Promise<{ events: ActivityEvent[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const events = await apiGetActivityStream(session.accessToken, programId);
    return { events };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load activity.' };
  }
}

export async function postComment(
  programId: string,
  payload: CreateCommentPayload,
): Promise<{ comment: ProgramComment } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    // No revalidatePath: a route refresh here disrupts the open drawer.
    // The drawer refetches the activity stream itself after a post.
    const comment = await apiPostComment(session.accessToken, programId, payload);
    return { comment };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to post comment.' };
  }
}

export async function loadCommentPermission(
  programId: string,
): Promise<{ canComment: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetCommentPermission(session.accessToken, programId);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load permission.' };
  }
}

export async function deleteComment(
  commentId: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    // No revalidatePath: keeps the open drawer from being torn down.
    await apiDeleteComment(session.accessToken, commentId);
    return { success: 'Comment deleted.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to delete comment.' };
  }
}
export async function resolveCommentThread(
  commentId: string,
  resolved: boolean,
  note?: string,
  reply?: string,
): Promise<{ comment: ProgramComment } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    // No revalidatePath: keeps the open drawer from being torn down.
    const comment = resolved
      ? await apiResolveComment(session.accessToken, commentId, note, reply)
      : await apiUnresolveComment(session.accessToken, commentId);
    return { comment };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to update comment thread.',
    };
  }
}

export async function loadProgramComments(
  programId: string,
  opts?: { targetId?: string },
): Promise<{ comments: ProgramComment[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const comments = await apiGetComments(session.accessToken, programId, opts);
    return { comments };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load comments.' };
  }
}

export async function loadEndorsements(
  programId: string,
): Promise<
  { version: number; endorsements: ProgramEndorsementRecord[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetProgramEndorsements(session.accessToken, programId);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load endorsements.' };
  }
}
export async function loadApprovals(
  programId: string,
): Promise<
  { version: number; approvals: ProgramApprovalRecord[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetProgramApprovals(session.accessToken, programId);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load approvals.' };
  }
}
export async function getProgramDetail(
  programId: string,
): Promise<{ program: ProgramDetailRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const program = await apiGetProgram(session.accessToken, programId);
    return { program };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load program detail.' };
  }
}

export async function getProjectActivityActivityStream(
  paId: string,
): Promise<{ events: ActivityEvent[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const events = await apiGetProjectActivityStream(session.accessToken, paId);
    return { events };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load activity.' };
  }
}

export async function postProjectActivityComment(
  programId: string,
  paId: string,
  payload: Omit<CreateCommentPayload, 'targetType' | 'targetId'>,
): Promise<{ comment: ProgramComment } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const comment = await apiPostComment(session.accessToken, programId, {
      ...payload,
      targetType: 'PROJECT_ACTIVITY',
      targetId: paId,
    });
    return { comment };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to post comment.' };
  }
}

export async function getProjectActivityDetail(
  id: string,
): Promise<{ detail: ProjectActivityDetailRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    const detail = await apiGetProjectActivity(session.accessToken, id);
    return { detail };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load project/activity detail.' };
  }
}

export async function markProgramSeen(
  programId: string,
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiMarkProgramSeen(session.accessToken, programId);
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to mark program seen.' };
  }
}
export async function loadProgramPublicFeedback(
  programId: string,
): Promise<PublicFeedbackItem[] | { error: string }> {
  try {
    return await apiPublicGetFeedback(programId);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return [];
    return { error: 'Failed to load public feedback.' };
  }
}
/**
 * Citizen feedback left on one PPA, for the Public Feedback tab of the
 * project/activity drawer. Curried on the parent program because the public
 * endpoint is nested under it, while the drawer only knows its own id.
 *
 * A 404 means the program is not publicly visible yet (still a draft), which is
 * an empty list rather than an error — same treatment as the program-level
 * loader above.
 */
export async function loadProjectActivityPublicFeedback(
  programId: string,
  paId: string,
): Promise<PublicFeedbackItem[] | { error: string }> {
  try {
    return await apiPublicGetPAFeedback(programId, paId);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return [];
    return { error: 'Failed to load public feedback.' };
  }
}

// ─── Publish lifecycle (Phase 1 §3.2-3.4) ────────────────────────────────────

/**
 * Opening a revision is a deliberate act, not a side effect of typing: it is the
 * moment a published AIP starts to diverge from what the public sees, so it gets
 * a confirm dialog and an audit row (D8).
 */
export async function reviseProgram(
  programId: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiReviseProgram(session.accessToken, programId);
    revalidatePath('/aip-registry');
    return {
      success:
        'Revision opened. The public keeps seeing the published version until you republish.',
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to open a revision.' };
  }
}

export async function publishProgram(
  programId: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const res = await apiPublishProgram(session.accessToken, programId);
    revalidatePath('/aip-registry');
    revalidatePath('/aip');
    return {
      success: `Published as v${res.version} · ${res.aipReferenceCode}`,
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to publish.' };
  }
}

export async function discardProgramDraft(
  programId: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const res = await apiDiscardProgramDraft(session.accessToken, programId);
    revalidatePath('/aip-registry');
    return { success: res.message };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to discard the draft.' };
  }
}

export async function archiveProgram(
  programId: string,
  reason: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiArchiveProgram(session.accessToken, programId, reason);
    revalidatePath('/aip-registry');
    return { success: 'Archived. It no longer counts in any total.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to archive.' };
  }
}

export async function unarchiveProgram(
  programId: string,
  reason: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUnarchiveProgram(session.accessToken, programId, reason);
    revalidatePath('/aip-registry');
    return { success: 'Back in Drafts. Publish it again to make it count.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to unarchive.' };
  }
}

export async function acknowledgeProgramImport(
  programId: string,
): Promise<{ success: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiAcknowledgeProgramImport(session.accessToken, programId);
    revalidatePath('/aip-registry');
    return {
      success:
        'Import decisions confirmed. This program can now be published once the rest is ready.',
    };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to confirm the import decisions.',
    };
  }
}

export async function loadPublishReadiness(
  programId: string,
): Promise<{ readiness: PublishReadiness } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const readiness = await apiGetPublishReadiness(
      session.accessToken,
      programId,
    );
    return { readiness };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to check readiness.' };
  }
}

export async function loadDraftDiff(
  programId: string,
): Promise<{ diff: ProgramDraftDiff } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const diff = await apiGetProgramDraftDiff(session.accessToken, programId);
    return { diff };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load the diff.' };
  }
}

// ─── Edit history (Phase 1 §3.6) ─────────────────────────────────────────────

export async function loadProgramEditHistory(
  programId: string,
  params?: { action?: string; actorUserId?: string; cursor?: string },
): Promise<{ page: EditHistoryPage } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const page = await apiGetProgramEditHistory(
      session.accessToken,
      programId,
      params,
    );
    return { page };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load edit history.' };
  }
}

export async function loadAllEditHistory(
  params?: { officeId?: string; action?: string; cursor?: string },
): Promise<{ page: EditHistoryPage } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const page = await apiGetAllEditHistory(session.accessToken, params);
    return { page };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load edit history.' };
  }
}

export async function loadProjectActivityEditHistory(
  paId: string,
  params?: { cursor?: string },
): Promise<{ page: EditHistoryPage } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const page = await apiGetProjectActivityEditHistory(
      session.accessToken,
      paId,
      params,
    );
    return { page };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load edit history.' };
  }
}

// ─── Batch publish (Phase 1 D23) ─────────────────────────────────────────────

/**
 * Per-cluster count of entries still awaiting publication, for the picker in the
 * batch-publish dialog.
 */
export async function loadPublishableCounts(
  aipCycleId: string,
): Promise<{ counts: Record<string, number> } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const counts = await apiPublishableCounts(session.accessToken, aipCycleId);
    return { counts };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load cluster counts.' };
  }
}

export async function previewClusterPublish(
  aipCycleId: string,
  clusterIds: string[],
): Promise<{ readiness: PublishReadiness[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const readiness = await apiPublishPreview(
      session.accessToken,
      aipCycleId,
      clusterIds,
    );
    return { readiness };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to check readiness.' };
  }
}

export async function acknowledgeClusterImports(
  aipCycleId: string,
  clusterIds: string[],
): Promise<{ result: AcknowledgeImportsResult } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const result = await apiAcknowledgeImports(
      session.accessToken,
      aipCycleId,
      clusterIds,
    );
    revalidatePath('/aip-registry');
    return { result };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to confirm import decisions.',
    };
  }
}

export async function publishCluster(
  aipCycleId: string,
  clusterIds: string[],
): Promise<{ result: ClusterPublishResult } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const result = await apiPublishCluster(
      session.accessToken,
      aipCycleId,
      clusterIds,
    );
    revalidatePath('/aip-registry');
    revalidatePath('/aip');
    return { result };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to publish the cluster.' };
  }
}

/** Special funds with stated amounts for a cycle — staff-only (specs/008). */
/**
 * The year's finalized LEP and Ordinance, offered as LBP sources (specs/012
 * P6). Empty without `budget:read`, so the option simply does not show.
 */
export async function loadLbpDocuments(
  fiscalYear: number,
): Promise<Array<{ id: string; label: string }>> {
  const session = await getSession();
  if (!session || !hasPermission(session.user, 'budget:read')) return [];
  const docs = await apiListBudgetDocuments(session.accessToken).catch(() => []);
  return docs
    .filter((d) => d.budgetCycle.fiscalYear === fiscalYear && d.status !== 'DRAFT')
    .map((d) => ({
      id: d.id,
      label:
        d.kind === 'ORDINANCE'
          ? `FY${fiscalYear} Appropriation Ordinance (enacted)`
          : `FY${fiscalYear} Local Expenditure Program (submitted)`,
    }));
}

export async function loadSpecialFunds(cycleId: string): Promise<SpecialFundRecord[]> {
  const session = await getSession();
  if (!session) return [];
  return apiGetSpecialFunds(session.accessToken, cycleId).catch(() => []);
}
