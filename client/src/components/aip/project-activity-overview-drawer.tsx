"use client";

import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { toast } from "sonner";
import {
  X,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  Edit,
  Lock,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  getProgramStatusBorderedClass,
  isEditableProgramStatus,
} from "@/lib/program-status";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/currency-formatter";
import { cn } from "@/lib/utils";
import { deleteProjectActivityAction } from "@/app/programs/[id]/add-project/_actions";
import {
  getProjectActivityDetail,
  getProjectActivityActivityStream,
  postProjectActivityComment,
  loadCommentPermission,
  deleteComment,
  resolveCommentThread,
} from "@/app/aip-registry/_actions";
import { ActivitySection } from "./activity-section";
import type { CreateCommentPayload } from "@/lib/api";
import type { AIPEntry } from "./aip-master-list";
import type { ProjectActivityDetailRecord } from "@/lib/api";
import { DrawerResizeHandle } from "@/components/custom/drawer-resize-handle";
import type { ResizeSource } from "@/components/custom/drawer-resize-handle";
import { PublicFeedbackPanel, SubItemsSummary } from "./program-overview-drawer";
import { DrawerActionButton } from "./drawer-action-button";
import EditHistoryTab from "@/components/aip/edit-history-tab";
import { DrawerTabPanel, DrawerTabs } from "./drawer-tabs";
import type { DrawerTab } from "./drawer-tabs";
import type { PublicFeedbackItem } from "@/lib/api";
import { fundSourceLabel } from "@/lib/schemas";
import AddProjectForm from "@/components/project-activity/add-project-form";
import { GOAL } from '@/lib/goal-label';


const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return "";
  return `${MONTH_NAMES[month - 1] ?? ""} ${year}`.trim();
}

type ProjectActivityOverviewEntry = AIPEntry & {
  created_date?: string;
  updated_date?: string;
  department_id?: string;
  departmentId?: string;
  department_name?: string;
  departmentName?: string;
  department?: string;
  remarks?: string;
};

interface ProjectActivityOverviewDrawerProps {
  isOpen: boolean;
  item: AIPEntry | null;
  onClose: () => void;
  onViewProgram?: (programId: string) => void;
  parentProgramId?: string;
  parentProgramName?: string;
  parentProgramStatus?:
    | "Draft"
    | "For Revision"
    | "Submitted"
    | "Head Reviewed"
    | "Pending Endorsement"
    | "Endorsed"
    | "Pending Approval"
    | "For Review"
    | "Under Review"
    | "Approved"
    | "Rejected"
    | "Published"
    | "Revision"
    | "Archived";
  parentProjectId?: string;
  parentProjectName?: string;
  onViewProject?: (projectId: string) => void;
  onOpenSubItem?: (item: AIPEntry) => void;
  onDeleteSuccess?: () => void;
  /** Holds `aip:audit` — gates the per-PPA History tab. */
  canAudit?: boolean;
  /** Holds `aip:write` — a reader gets no Edit/Delete, as on the program drawer (#102). */
  canWrite: boolean;
  /** Supplied only where citizen feedback should be shown; gates that tab. */
  loadPublicFeedback?: (
    paId: string,
  ) => Promise<PublicFeedbackItem[] | { error: string }>;
  /** Opens the drawer straight into edit mode — seeded from the retired
   * `/projects/:id/edit` / `/activities/:id/edit` routes' redirect. */
  initialMode?: "view" | "edit";
  /** Fires after a successful in-place edit save, so the caller can refresh
   * the registry row (mirrors ProgramOverviewDrawer's `onPublishChanged`). */
  onEdited?: () => void;
  /** Reports the user switching between view and edit (not the initial mode), so the host can put `/edit` in the URL. */
  onModeChange?: (mode: "view" | "edit") => void;
  /** Peek-navigation: steps to the next/previous row in the registry table
   * (program, project or activity) without closing the drawer. */
  onNavigate?: (direction: 1 | -1) => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

type PATab = "details" | "comments" | "feedback" | "history";

const STORAGE_KEY = "program-drawer-width";
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 460;
const MAX_WIDTH = 820;
/**
 * Below this the footer labels stop fitting and the row wraps, so the actions
 * collapse to icons instead. Only applies on desktop — on mobile the drawer is
 * full-width and there is always room.
 */
const COMPACT_ACTIONS_WIDTH = 540;

/**
 * Sticky header matching ProgramOverviewDrawer styling
 */
function ProjectActivityOverviewHeader({
  item,
  onClose,
  onResetWidth,
  onNavigate,
  canNavigatePrev,
  canNavigateNext,
}: {
  item: AIPEntry;
  onClose: () => void;
  onResetWidth?: () => void;
  onNavigate?: (direction: 1 | -1) => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}) {
  const headerColor =
    item.ppa_type === "Activity" ? "bg-orange-600" : "bg-green-600";
  const headerHoverBg =
    item.ppa_type === "Activity"
      ? "hover:bg-orange-700/40"
      : "hover:bg-green-700/40";
  const subTextColor = item.ppa_type === "Activity" ? "#fed7aa" : "#bbf7d0";

  return (
    <div
      className={`sticky top-0 z-20 ${headerColor} text-white px-6 py-3 shadow-sm`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-0.5 flex items-center gap-2">
            <p
              className="text-[9px] font-normal tracking-[0.11em]"
              style={{ color: subTextColor }}
            >
              {item.ppa_type === "Activity"
                ? "ACTIVITY OVERVIEW"
                : "PROJECT OVERVIEW"}
            </p>
            {onNavigate && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onNavigate(-1)}
                  disabled={!canNavigatePrev}
                  aria-label="Previous row"
                  title="Previous row"
                  className={`flex h-4 w-4 items-center justify-center rounded text-white/70 transition-colors ${headerHoverBg} hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(1)}
                  disabled={!canNavigateNext}
                  aria-label="Next row"
                  title="Next row"
                  className={`flex h-4 w-4 items-center justify-center rounded text-white/70 transition-colors ${headerHoverBg} hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-start gap-2">
            <h2 className="mb-0 line-clamp-2 flex-1 min-w-0 text-[15px] font-semibold leading-[1.18] text-white">
              {item.program_name || item.ppa_description}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "mt-0.5 shrink-0 rounded px-1.5 py-0 text-[8px] font-normal",
                getProgramStatusBorderedClass(item.status),
              )}
            >
              {item.status_label ?? item.status}
            </Badge>
          </div>
          <p
            className="text-[9px] font-mono tracking-tight"
            style={{ color: subTextColor }}
          >
            {item.program_code}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0">
          {onResetWidth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetWidth}
              className={`h-5 px-0.5 text-[8px] font-normal tracking-[0.01em] text-white/60 ${headerHoverBg}`}
            >
              Reset width
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close drawer"
            className={`h-5 w-5 p-0 shrink-0 text-white/60 ${headerHoverBg}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AncestorHierarchyStrip({
  parentProgramName,
  onBack,
  parentProjectName,
  onViewProject,
}: {
  parentProgramName?: string;
  onBack?: () => void;
  parentProjectName?: string;
  onViewProject?: () => void;
}) {
  if (!parentProgramName) return null;
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5">
      <div className="border-l-2 border-blue-200 pl-3 space-y-0.5">
        {/* Program row */}
        {onBack ? (
          <button
            onClick={onBack}
            className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-medium text-blue-700">
              Program
            </span>
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {parentProgramName}
            </span>
            <ChevronRight className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600">
            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-medium text-blue-700">
              Program
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {parentProgramName}
            </span>
          </div>
        )}
        {/* Project row */}
        {parentProjectName && (
          <div className="flex min-w-0 items-center pl-3">
            <span className="mr-1.5 shrink-0 text-[11px] text-slate-400">
              ↳
            </span>
            {onViewProject ? (
              <button
                onClick={onViewProject}
                className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-px text-[10px] font-medium text-green-700">
                  Project
                </span>
                <span className="min-w-0 flex-1 truncate text-left font-medium">
                  {parentProjectName}
                </span>
                <ChevronRight className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600">
                <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-px text-[10px] font-medium text-green-700">
                  Project
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {parentProjectName}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectActivityMetadataGrid({
  item,
  detail,
}: {
  item: AIPEntry;
  detail: ProjectActivityDetailRecord | null;
}) {
  const itemData = item as ProjectActivityOverviewEntry;
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const createdIso = detail?.createdAt ?? (itemData.created_date || undefined);
  const updatedIso = detail?.updatedAt ?? (itemData.updated_date || undefined);
  const createdDate = createdIso
    ? new Date(createdIso).toLocaleDateString("en-US", dateFormatOptions)
    : "—";
  const updatedDate = updatedIso
    ? new Date(updatedIso).toLocaleDateString("en-US", dateFormatOptions)
    : "—";

  const startLabel = formatMonthYear(
    detail?.implementationStartMonth,
    detail?.implementationStartYear,
  );
  const endLabel = formatMonthYear(
    detail?.implementationEndMonth,
    detail?.implementationEndYear,
  );
  const implPeriodLabel =
    startLabel && endLabel
      ? `${startLabel} – ${endLabel}`
      : startLabel || endLabel || "";

  // The API sends the office's name with every entry (`office_name`). An entry
  // without one has no office, so there is nothing to look an id up against.
  const explicitDepartmentName = (itemData.department_name || itemData.departmentName || itemData.department || "").trim()
  const deptDisplay = itemData.office_name || explicitDepartmentName

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Administrative Details
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
        <div className="col-span-2">
          <p className="mb-1 text-xs font-medium text-slate-500">
            Implementation Period
          </p>
          {implPeriodLabel ? (
            <p className="text-sm font-semibold text-slate-950 tabular-nums">
              {implPeriodLabel}
            </p>
          ) : (
            <p className="text-sm font-medium italic text-slate-500">
              Not specified
            </p>
          )}
        </div>
        {detail?.climateChangeTag && (
          <div className="col-span-2">
            <p className="mb-1 text-xs font-medium text-slate-500">
              Climate Change Tag
            </p>
            {detail.climateChangeTag.codes.length === 0 ? (
              <p className="text-sm font-medium italic text-amber-700">
                Climate amount with no CCET code yet
              </p>
            ) : (
              detail.climateChangeTag.codes.map(({ ccetCode }) => (
                <p key={ccetCode.id} className="text-sm font-medium text-slate-900">
                  <span className="font-mono font-semibold text-slate-500">
                    {ccetCode.code}
                  </span>
                  {" — "}
                  {ccetCode.name}
                </p>
              ))
            )}
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Created</p>
          <p className="text-sm font-medium text-slate-950 tabular-nums">
            {createdDate}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Updated</p>
          <p className="text-sm font-medium text-slate-950 tabular-nums">
            {updatedDate}
          </p>
        </div>
        {/* Owner and Deadline */}
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Owner</p>
          <p className="text-sm font-semibold leading-tight text-slate-950">
            {deptDisplay || "-"}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Deadline</p>
          <p className="text-sm font-medium text-slate-950 tabular-nums">-</p>
        </div>
      </div>
    </section>
  );
}

function ProjectActivityBudgetGrid({
  item,
  detail,
}: {
  item: AIPEntry;
  detail: ProjectActivityDetailRecord | null;
}) {
  // Phase 1 D17: line-item entry is deferred, so the *Total rollups are
  // structurally 0 — prefer the estimates, keeping the rollup as the fallback
  // for legacy rows imported with line items.
  const ps = detail ? detail.psEstimate ?? detail.psTotal : item.ps_amount;
  const mooe = detail ? detail.mooeEstimate ?? detail.mooeTotal : item.mooe_amount;
  const fe = detail ? detail.feEstimate ?? detail.feTotal : item.fe_amount;
  const co = detail ? detail.coEstimate ?? detail.coTotal : item.co_amount;
  const total = detail
    ? detail.proposedBudget ?? detail.grandTotal
    : item.total_amount;
  const fundSources = detail?.fundSources ?? [];

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Budget Allocation
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/40">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm text-slate-600">Total Amount</p>
          <p className="text-2xl font-semibold leading-none tabular-nums text-slate-950">
            {formatCurrency(total)}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-200 text-center">
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">PS</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(ps)}
            </p>
          </div>
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">MOOE</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(mooe)}
            </p>
          </div>
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">FE</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(fe)}
            </p>
          </div>
          <div className="px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">CO</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(co)}
            </p>
          </div>
        </div>
        {/* Which funds this PPA draws on: what each pays when the row is split
            by fund, else a chip list over the one total. */}
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="mb-1.5 text-xs font-medium text-slate-500">
            Source of Funds
          </p>
          {detail?.fundAllocations?.length ? (
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-medium">Fund</th>
                  <th className="text-right font-medium">PS</th>
                  <th className="text-right font-medium">MOOE</th>
                  <th className="text-right font-medium">FE</th>
                  <th className="text-right font-medium">CO</th>
                </tr>
              </thead>
              <tbody>
                {detail.fundAllocations.map((line) => (
                  <tr key={line.fundSource} className="text-slate-950">
                    <td className="py-0.5 font-medium">{fundSourceLabel(line.fundSource)}</td>
                    <td className="text-right">{formatCurrency(line.ps)}</td>
                    <td className="text-right">{formatCurrency(line.mooe)}</td>
                    <td className="text-right">{formatCurrency(line.fe)}</td>
                    <td className="text-right">{formatCurrency(line.co)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : fundSources.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {fundSources.map((source) => (
                <span
                  key={source}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700"
                >
                  {fundSourceLabel(source)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium italic text-slate-500">
              Not specified
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectActivityDescriptionSection({
  item,
  detail,
}: {
  item: AIPEntry;
  detail: ProjectActivityDetailRecord | null;
}) {
  const description = (
    detail?.description ||
    item.ppa_description ||
    ""
  ).trim();
  const expectedOutput = (detail?.expectedOutput || "").trim();

  if (!description && !expectedOutput) return null;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {description && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Description
          </h3>
          <p className="text-sm leading-6 text-slate-700">{description}</p>
        </div>
      )}
      {expectedOutput && (
        <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
            Expected Output
          </p>
          <p className="text-sm font-medium leading-6 text-blue-950">
            {expectedOutput}
          </p>
        </div>
      )}
    </section>
  );
}

function LineItemsSection({
  lineItems,
}: {
  lineItems: ProjectActivityDetailRecord["lineItems"];
}) {
  if (lineItems.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Line Items ({lineItems.length})
      </h3>
      <div className="divide-y divide-slate-100">
        {lineItems.map((li) => (
          <div
            key={li.id}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {li.expenseClass}
              </span>
              <span className="truncate text-slate-700">
                {li.quantity && li.unit
                  ? `${li.quantity} ${li.unit}`
                  : li.uacsObjectId}
              </span>
            </div>
            <span className="ml-3 shrink-0 font-semibold tabular-nums text-slate-950">
              {formatCurrency(Number(li.lineTotal))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A PPA's effective thematic tags (read-only): its own direct applications
 * plus whatever its parent Program currently carries, with the inherited ones
 * marked by a lock icon — mirroring `ThematicTagSection`'s editable view, but
 * with no remove control. Deduped by id so a tag applied both directly and
 * inherited from the parent only renders once, as a direct (unlocked) badge.
 */
function ProjectActivityThematicTagsSection({
  detail,
}: {
  detail: ProjectActivityDetailRecord | null;
}) {
  const direct = detail?.thematicTags ?? [];
  const directIds = new Set(direct.map((tag) => tag.id));
  const inherited = (detail?.inheritedThematicTags ?? []).filter(
    (tag) => !directIds.has(tag.id),
  );

  if (direct.length === 0 && inherited.length === 0) {
    return (
      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Thematic Tags
        </h3>
        <p className="text-sm italic text-slate-400">No tags applied</p>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Thematic Tags
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {inherited.map((tag) => (
          <Badge
            key={`inherited-${tag.id}`}
            variant="outline"
            className="gap-1.5 py-1 pl-2.5 pr-2 text-xs font-medium text-muted-foreground"
          >
            {tag.name}
            <Lock className="size-3" />
          </Badge>
        ))}
        {direct.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="text-xs font-medium">
            {tag.name}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function RemarksSection({ remarks }: { remarks?: string | null }) {
  if (!remarks) return null;

  return (
    <section className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50/70 p-3">
      <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-800" />
      <div>
        <p className="text-sm font-semibold text-yellow-900">Remarks</p>
        <p className="mt-1 text-xs leading-5 text-yellow-800">{remarks}</p>
      </div>
    </section>
  );
}

function SkeletonDetail() {
  return (
    <div className="space-y-4 p-5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 h-3 w-24 rounded bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-slate-100" />
            <div className="h-4 w-3/4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <div>
        <p className="text-sm font-semibold text-slate-800">
          Failed to load details
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Could not fetch project/activity data.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClose}>
        <ChevronLeft className="h-4 w-4 mr-1.5" />
        Close
      </Button>
    </div>
  );
}

function ProjectActivityOverviewFooter({
  canEdit,
  canDelete,
  compact,
  onEdit,
  onRequestDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  /** Drawer is too narrow for labels — render icon-only. */
  compact: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  // No primary action here in Phase 1: submit-for-review is retired (§3.5), and
  // publishing is an act on the program, not on one PPA.
  return (
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 shadow-sm">
      {/* No Close button: the sheet already closes on overlay click, Escape and
          the header ✕, so a fourth affordance was just noise. */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <DrawerActionButton
          icon={Edit}
          label="Edit"
          compact={compact}
          disabled={!canEdit}
          title={
            canEdit
              ? "Edit"
              : "This program is published — open a revision to edit it"
          }
          onClick={() => canEdit && onEdit()}
        />
        <DrawerActionButton
          icon={Trash2}
          label="Delete"
          compact={compact}
          disabled={!canDelete}
          title={
            canDelete
              ? "Delete"
              : "This program is published — open a revision to delete this entry"
          }
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => canDelete && onRequestDelete()}
        />
      </div>
    </div>
  );
}

export function ProjectActivityOverviewDrawer({
  isOpen,
  item,
  onClose,
  onViewProgram,
  parentProgramId,
  parentProgramName,
  parentProgramStatus,
  parentProjectId,
  parentProjectName,
  onViewProject,
  onOpenSubItem,
  onDeleteSuccess,
  canAudit,
  canWrite,
  loadPublicFeedback,
  initialMode = "view",
  onEdited,
  onModeChange,
  onNavigate,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Readonly<ProjectActivityOverviewDrawerProps>) {
  const [activeTab, setActiveTab] = useState<PATab>("details");
  // In-place view/edit toggle (US5), replacing the old `router.push
  // ('/projects|activities/:id/edit')`. Resets to 'view' whenever a different
  // row is opened, so switching rows never leaves a stale edit form showing.
  // A deep link asks for edit; honour it only where the footer's Edit button
  // would be enabled (same gate as `canEdit` below).
  const startMode =
    initialMode === "edit" && canWrite && isEditableProgramStatus(parentProgramStatus) ? "edit" : "view";
  const [mode, setMode] = useState<"view" | "edit">(startMode);
  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => setMode(startMode));
  }, [isOpen, item?.id, startMode]);
  const changeMode = (next: "view" | "edit") => {
    setMode(next);
    onModeChange?.(next);
  };
  const [drawerWidth, setDrawerWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_WIDTH;
    const parsed = parseInt(stored, 10);
    return !isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH
      ? parsed
      : DEFAULT_WIDTH;
  });
  const [isKeyboardResizeTransition, setIsKeyboardResizeTransition] =
    useState(false);
  const [showResetToast, setShowResetToast] = useState(false);
  const resizeTransitionTimeoutRef = useRef<number | null>(null);
  const resetToastTimeoutRef = useRef<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768,
  );
  type DetailState =
    | { status: "idle" | "error"; detail: null }
    | { status: "ready"; detail: ProjectActivityDetailRecord };
  type DetailAction =
    | { type: "loaded"; detail: ProjectActivityDetailRecord }
    | { type: "failed" }
    | { type: "reset" };
  const [{ status: detailStatus, detail }, dispatchDetail] = useReducer(
    (_: DetailState, action: DetailAction): DetailState => {
      if (action.type === "loaded")
        return { status: "ready", detail: action.detail };
      if (action.type === "failed") return { status: "error", detail: null };
      return { status: "idle", detail: null };
    },
    { status: "idle", detail: null },
  );

  const handlePostComment = useCallback(
    (paId: string, payload: CreateCommentPayload) => {
      if (!parentProgramId)
        return Promise.resolve({ error: "No program context." } as {
          error: string;
        });
      return postProjectActivityComment(parentProgramId, paId, payload);
    },
    [parentProgramId],
  );

  // Composer visibility: comment permission is program-level, so check it
  // against the parent program. Keyed by program id so a stale result never
  // shows the composer; hidden until confirmed.
  const [perm, setPerm] = useState<{
    programId: string;
    canComment: boolean;
  } | null>(null);
  useEffect(() => {
    if (!isOpen || !parentProgramId) return;
    let cancelled = false;
    void loadCommentPermission(parentProgramId).then((r) => {
      if (!cancelled && "canComment" in r)
        setPerm({ programId: parentProgramId, canComment: r.canComment });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, parentProgramId]);
  const canComment =
    !!parentProgramId &&
    perm?.programId === parentProgramId &&
    perm.canComment;

  // Bumped after a successful edit-mode save so the drawer's own view (not
  // just the registry row) reflects the new values immediately (US5/T028).
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !item) return;
    let cancelled = false;
    getProjectActivityDetail(item.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        dispatchDetail({ type: "failed" });
      } else {
        dispatchDetail({ type: "loaded", detail: result.detail });
      }
    });
    return () => {
      cancelled = true;
      dispatchDetail({ type: "reset" });
    };
  }, [isOpen, item?.id, detailRefreshKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(drawerWidth));
  }, [drawerWidth]);

  useEffect(() => {
    return () => {
      if (resizeTransitionTimeoutRef.current)
        window.clearTimeout(resizeTransitionTimeoutRef.current);
      if (resetToastTimeoutRef.current)
        window.clearTimeout(resetToastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const handleResize = useCallback((newWidth: number, source: ResizeSource) => {
    if (source === "keyboard") {
      setIsKeyboardResizeTransition(true);
      if (resizeTransitionTimeoutRef.current)
        window.clearTimeout(resizeTransitionTimeoutRef.current);
      resizeTransitionTimeoutRef.current = window.setTimeout(() => {
        setIsKeyboardResizeTransition(false);
      }, 180);
    } else {
      setIsKeyboardResizeTransition(false);
    }
    setDrawerWidth(newWidth);
  }, []);

  const resetWidth = () => {
    localStorage.removeItem(STORAGE_KEY);
    setDrawerWidth(DEFAULT_WIDTH);
    setShowResetToast(true);
    if (resetToastTimeoutRef.current)
      window.clearTimeout(resetToastTimeoutRef.current);
    resetToastTimeoutRef.current = window.setTimeout(
      () => setShowResetToast(false),
      1400,
    );
  };

  const handleViewProgram = () => {
    if (!parentProgramId) return;
    if (onViewProgram) {
      onViewProgram(parentProgramId);
    }
  };

  const handleViewProject = () => {
    if (!parentProjectId) return;
    if (onViewProject) {
      onViewProject(parentProjectId);
    }
  };

  const handleEdit = () => {
    if (!item) return;
    changeMode("edit");
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);

    try {
      const result = await deleteProjectActivityAction(item.id);

      if (result.success) {
        setShowDeleteConfirm(false);
        onClose();
        onDeleteSuccess?.();
      } else {
        toast.error(`Failed to delete ${item.ppa_type}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Failed to delete ${item.ppa_type}:`, error);
      toast.error(
        `An unexpected error occurred while deleting the ${item.ppa_type}. Please try again.`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!item) return null;

  // Both gates mirror `ProjectActivitiesService`, which guards PA update *and*
  // PA delete with `isEditableStatus` — removing a PPA from an open revision is a
  // working-copy edit like any other, and the public keeps seeing the published
  // snapshot until someone republishes.
  //
  // `isDeletableProgramStatus` (DRAFT/FOR_REVISION only) is the rule for deleting
  // a whole *program*, where the concern is a published AIP vanishing. Applying
  // it here disabled Delete on every PPA inside a revision for an action the
  // server accepts.
  const canEdit = isEditableProgramStatus(parentProgramStatus);
  const canDelete = canEdit;
  const isActivity = item.ppa_type === "Activity";

  // Tabs replace one long scroll column. History is audit-gated and public
  // feedback only appears when a loader was supplied, so the strip never shows
  // a tab that would open an empty or forbidden panel.
  const paTabs: DrawerTab<PATab>[] = [
    { value: "details", label: "Details" },
    { value: "comments", label: "Comments" },
    ...(loadPublicFeedback
      ? [{ value: "feedback" as const, label: "Public Feedback" }]
      : []),
    ...(canAudit ? [{ value: "history" as const, label: "History" }] : []),
  ];

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-auto border-r border-slate-200 bg-slate-50 p-0 shadow-lg flex flex-col data-[side=right]:sm:max-w-none"
          style={{
            width: isDesktop ? `${drawerWidth}px` : "100%",
            transition: isKeyboardResizeTransition
              ? "width 160ms ease-out"
              : "none",
          }}
        >
          {isDesktop && (
            <DrawerResizeHandle
              onResize={handleResize}
              width={drawerWidth}
              minWidth={MIN_WIDTH}
              maxWidth={MAX_WIDTH}
            />
          )}

          {mode === "edit" ? (
            <AddProjectForm
              projectId={item.ppa_type === "Project" ? item.id : undefined}
              activityId={item.ppa_type === "Activity" ? item.id : undefined}
              editMode
              onNavigateAway={() => changeMode("view")}
              onSaved={() => {
                changeMode("view");
                setDetailRefreshKey((k) => k + 1);
                onEdited?.();
              }}
              onNavigate={onNavigate}
              canNavigatePrev={canNavigatePrev}
              canNavigateNext={canNavigateNext}
            />
          ) : (
          <div className="flex h-full flex-col">
            {/* Header */}
            <ProjectActivityOverviewHeader
              item={item}
              onClose={onClose}
              onResetWidth={isDesktop ? resetWidth : undefined}
              onNavigate={onNavigate}
              canNavigatePrev={canNavigatePrev}
              canNavigateNext={canNavigateNext}
            />

            {/* Ancestor hierarchy strip */}
            <AncestorHierarchyStrip
              parentProgramName={parentProgramName}
              onBack={parentProgramId ? handleViewProgram : undefined}
              parentProjectName={parentProjectName}
              onViewProject={parentProjectId ? handleViewProject : undefined}
            />

            <DrawerTabs
              idPrefix="pa-overview"
              tabs={paTabs}
              value={activeTab}
              onChange={setActiveTab}
            />

            {/* Content */}
            <ScrollArea className="flex-1">
              {detailStatus === "idle" && <SkeletonDetail />}
              {detailStatus === "error" && <ErrorState onClose={onClose} />}
              {detailStatus === "ready" && detail && (
                <div className="space-y-4 p-6">
                  <DrawerTabPanel
                    idPrefix="pa-overview"
                    value="details"
                    active={activeTab === "details"}
                  >
                    <div className="space-y-4">
                  <ProjectActivityMetadataGrid item={item} detail={detail} />
                  <ProjectActivityDescriptionSection
                    item={item}
                    detail={detail}
                  />

                  {item.primary_finish_line_id && (
                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {GOAL}
                      </h3>
                      {item.finishLineVisionNumber != null && (
                        <p className="mb-0.5 text-xs font-medium text-slate-500">
                          FL{item.finishLineVisionNumber}
                        </p>
                      )}
                      <p className="text-sm font-semibold text-slate-950">
                        {item.finishLineName ?? item.primary_finish_line_id}
                      </p>
                      {item.subFinishLineName && (
                        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2">
                          <span className="text-xs font-medium text-slate-500">
                            Sub:
                          </span>
                          <span className="text-xs text-slate-700">
                            {item.subFinishLineName}
                          </span>
                        </div>
                      )}
                    </section>
                  )}

                  {item.ppa_type !== "Activity" &&
                    (item.children?.length ?? 0) > 0 && (
                      <SubItemsSummary
                        program={item}
                        // `item` is a Project here, so these children are the
                        // activities nested under it — the reorder is scoped to
                        // that parent, not the program root.
                        programId={parentProgramId}
                        canReorder={canEdit}
                        onOpen={onOpenSubItem}
                      />
                    )}
                  <ProjectActivityBudgetGrid item={item} detail={detail} />
                  <ProjectActivityThematicTagsSection detail={detail} />
                  <LineItemsSection lineItems={detail?.lineItems ?? []} />
                  <RemarksSection remarks={detail?.remarks} />
                    </div>
                  </DrawerTabPanel>

                  <DrawerTabPanel
                    idPrefix="pa-overview"
                    value="comments"
                    active={activeTab === "comments"}
                  >
                    <ActivitySection
                      entityId={item.id}
                      loadActivityStream={getProjectActivityActivityStream}
                      postComment={
                        parentProgramId ? handlePostComment : undefined
                      }
                      canComment={canComment}
                      deleteComment={deleteComment}
                      resolveComment={resolveCommentThread}
                    />
                  </DrawerTabPanel>

                  {loadPublicFeedback && (
                    <DrawerTabPanel
                      idPrefix="pa-overview"
                      value="feedback"
                      active={activeTab === "feedback"}
                    >
                      <PublicFeedbackPanel
                        programId={item.id}
                        loadPublicFeedback={loadPublicFeedback}
                      />
                    </DrawerTabPanel>
                  )}

                  {/* Screen 7: the same stream filtered to this PPA. Its own
                      tab, never merged with the comment thread. */}
                  {canAudit && (
                    <DrawerTabPanel
                      idPrefix="pa-overview"
                      value="history"
                      active={activeTab === "history"}
                    >
                      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <EditHistoryTab projectActivityId={item.id} />
                      </section>
                    </DrawerTabPanel>
                  )}

                  <div className="h-2" />
                </div>
              )}
            </ScrollArea>

            {canWrite && (
            <ProjectActivityOverviewFooter
              canEdit={canEdit}
              canDelete={canDelete}
              compact={isDesktop && drawerWidth < COMPACT_ACTIONS_WIDTH}
              onEdit={handleEdit}
              onRequestDelete={() => setShowDeleteConfirm(true)}
            />
            )}
          </div>
          )}

          <div
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute bottom-16 right-4 z-30 rounded-md border border-neutral-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-neutral-700 shadow-sm transition-all duration-150",
              showResetToast
                ? "translate-y-0 opacity-100"
                : "translate-y-1 opacity-0",
            )}
          >
            Drawer width reset
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {isActivity ? "Activity" : "Project"}
            </DialogTitle>
            <DialogDescription>
              {isActivity ? (
                <>
                  This activity will be permanently deleted. This action cannot
                  be undone.
                </>
              ) : (
                <>
                  This project and all its activities will be permanently
                  deleted. This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
