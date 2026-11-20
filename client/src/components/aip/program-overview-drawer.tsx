"use client"

import { useState, useEffect, useRef, useTransition, useReducer } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { X, Edit, AlertTriangle, Plus, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, FileText, MessageSquare, Loader2, Trash2, ShieldCheck, GitCompare, CornerDownRight, CheckCircle2, RotateCcw, Lock, ArrowUpDown, GripVertical, } from "lucide-react"
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ThematicTagBadges } from "@/components/public/thematic-tag-badge"
import {
  getProgramStatusBorderedClass,
  isDeletableProgramStatus,
  isEditableProgramStatus,
} from "@/lib/program-status"
import PublishPanel from "@/components/aip/publish-panel"
import EditHistoryTab from "@/components/aip/edit-history-tab"
import { DrawerActionButton } from "./drawer-action-button"
import { DrawerTabPanel, DrawerTabs } from "./drawer-tabs"
import type { DrawerTab } from "./drawer-tabs"

type ProgramTab = "details" | "comments" | "feedback" | "history"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/lib/currency-formatter"
import { getFinishLineLabel } from "@/lib/finish-lines"
import { papClassLabel } from "@/lib/schemas"
import { reorderProjectActivities } from "./_reorder-actions"
import { cn } from "@/lib/utils"
import type { AIPEntry } from "./aip-master-list"
import { deleteProgramAction } from "@/app/programs/[id]/_actions"
import { getProgramDetail } from "@/app/aip-registry/_actions"
import NewProgramForm from "@/components/program/new-program-form"
import { endorserLabel } from "@/lib/api"
import type {
  ActivityEvent,
  CommentActor,
  CreateCommentPayload,
  ProgramComment,
  ProgramDetailRecord,
  ProgramEndorsementRecord,
  ProgramApprovalRecord,
  PublicFeedbackItem,
} from "@/lib/api"
import { DrawerResizeHandle } from "@/components/custom/drawer-resize-handle"
import type { ResizeSource } from "@/components/custom/drawer-resize-handle"
import { GOALS, goal } from '@/lib/goal-label';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return ""
  return `${MONTH_NAMES[month - 1] ?? ""} ${year}`.trim()
}

const ROLE_LABEL: Record<string, string> = {
  STAFF: "Staff",
  HEAD: "Head",
  SUPER_ADMIN: "Admin",
}

const STAGE_LABEL: Record<string, string> = {
  SECTOR_FEEDBACK: "Sector feedback",
  HEAD_REVIEW: "Head review",
  ENDORSEMENT: "Endorsement",
  APPROVAL: "Approval",
  GENERAL: "Comment",
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  )
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type ProgramOverviewEntry = AIPEntry & {
  created_date?: string
  updated_date?: string
  department_id?: string
  departmentId?: string
  department_name?: string
  departmentName?: string
  department?: string
  sector?: string
  expected_output_mfo?: string
  remarks?: string
}

interface ProgramOverviewDrawerProps {
  isOpen: boolean
  program: AIPEntry | null
  onClose: () => void
  onAddProject?: (programId: string) => void
  onAddActivity?: (programId: string) => void
  onSubmit?: (programId: string) => void
  onHeadReview?: (programId: string) => void
  rawProgramStatus?: string
  canPublish?: boolean
  canWrite?: boolean
  isSuperAdmin?: boolean
  /** Holds `aip:audit` — gates the History panel. */
  canAudit?: boolean
  onPublishChanged?: () => void
  isSubmitting?: boolean
  currentUserId?: string
  currentUserOfficeId?: string | null
  loadActivityStream?: (programId: string) => Promise<{ events: ActivityEvent[] } | { error: string }>
  postComment?: (programId: string, payload: CreateCommentPayload) => Promise<{ comment: ProgramComment } | { error: string }>
  loadCommentPermission?: (programId: string) => Promise<{ canComment: boolean } | { error: string }>
  deleteComment?: (commentId: string) => Promise<{ success: string } | { error: string }>
  resolveComment?: (commentId: string, resolved: boolean, note?: string, reply?: string) => Promise<{ comment: ProgramComment } | { error: string }>
  loadEndorsements?: (programId: string) => Promise<{ version: number; endorsements: ProgramEndorsementRecord[] } | { error: string }>
  loadApprovals?: (programId: string) => Promise<{ version: number; approvals: ProgramApprovalRecord[] } | { error: string }>
  decideApproval?: (
    programId: string,
    officeId: string,
    status: 'APPROVED' | 'RETURNED' | 'REJECTED',
    notes?: string,
  ) => Promise<{ success: string } | { error: string }>
  onApprovalDecided?: () => void
  /** Bumped by the parent on an SSE nudge for this program; triggers a stream refetch. */
  activityRefreshKey?: number
  onDeleteSuccess?: () => void
  onOpenSubItem: (item: AIPEntry) => void
  loadPublicFeedback?: (programId: string) => Promise<PublicFeedbackItem[] | { error: string }>
  /** Opens the "New Activity" drawer scoped to a Project row under this
   * program, instead of navigating to `/projects/:id/add-activity`. */
  onAddActivityForProject?: (parentProjectId: string, parentProgramId: string) => void
  /** Opens the drawer straight into edit mode — seeded from the retired
   * `/programs/:id/edit` route's redirect (`mode=edit` in the URL contract). */
  initialMode?: 'view' | 'edit'
  /** Reports the user switching between view and edit (not the initial mode), so the host can put `/edit` in the URL. */
  onModeChange?: (mode: 'view' | 'edit') => void
  /** Peek-navigation: steps to the next/previous row in the registry table
   * (program, project or activity) without closing the drawer. */
  onNavigate?: (direction: 1 | -1) => void
  canNavigatePrev?: boolean
  canNavigateNext?: boolean
}

const STORAGE_KEY = "program-drawer-width"
const DEFAULT_WIDTH = 640
const MIN_WIDTH = 460
const MAX_WIDTH = 820
/**
 * Below this the footer labels stop fitting and the row wraps, so the secondary
 * actions collapse to icons. Higher than the PA drawer's threshold because this
 * footer also carries a primary Add button. Desktop only — the mobile drawer is
 * full-width and always has room.
 */
const COMPACT_ACTIONS_WIDTH = 620


/**
 * Get badge styling for sub-item type (Project, Activity, etc.)
 */
function getTypeBadgeClass(ppaType: string): string {
  switch (ppaType) {
    case "Program":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "Project":
      return "bg-green-50 text-green-700 border-green-200"
    case "Activity":
      return "bg-orange-50 text-orange-700 border-orange-200"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

/**
 * Compact sticky header with government document styling
 */
function ProgramOverviewHeader({
  program,
  onClose,
  onResetWidth,
  onRequestDelete,
  breadcrumb,
  onNavigate,
  canNavigatePrev,
  canNavigateNext,
}: {
  program: AIPEntry
  onClose: () => void
  onResetWidth?: () => void
  onRequestDelete?: () => void
  breadcrumb?: { label: string; onClick: () => void }
  onNavigate?: (direction: 1 | -1) => void
  canNavigatePrev?: boolean
  canNavigateNext?: boolean
}) {
  return (
    <div className="sticky top-0 z-20 bg-blue-600 text-white px-6 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-0.5 flex items-center gap-2">
            {breadcrumb ? (
              <button
                onClick={breadcrumb.onClick}
                className="flex min-w-0 items-center gap-1 text-[9px] text-blue-200 hover:text-white"
              >
                <ChevronLeft className="h-3 w-3 shrink-0" />
                <span className="truncate">{breadcrumb.label}</span>
              </button>
            ) : (
              <span className="text-[9px] font-normal tracking-[0.11em] text-blue-100">
                PROGRAM OVERVIEW
              </span>
            )}
            {onNavigate && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onNavigate(-1)}
                  disabled={!canNavigatePrev}
                  aria-label="Previous row"
                  title="Previous row"
                  className="flex h-4 w-4 items-center justify-center rounded text-blue-200 transition-colors hover:bg-blue-700/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(1)}
                  disabled={!canNavigateNext}
                  aria-label="Next row"
                  title="Next row"
                  className="flex h-4 w-4 items-center justify-center rounded text-blue-200 transition-colors hover:bg-blue-700/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
            <Badge
              variant="outline"
              className={cn(
                "rounded px-1.5 py-0 text-[8px] font-normal border",
                getProgramStatusBorderedClass(program.status_label ?? program.status)
              )}
            >
              {program.status_label ?? program.status}
            </Badge>
          </div>
          <h2 className="mb-0 line-clamp-2 text-[15px] font-semibold leading-[1.18] text-white">
            {program.program_name || program.ppa_description}
          </h2>
          <p className="text-[9px] font-mono tracking-tight text-blue-100/80">
            {program.program_code}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0">
          {onResetWidth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetWidth}
              className="h-5 px-0.5 text-[8px] font-normal tracking-[0.01em] text-blue-100/60 hover:text-blue-50 hover:bg-blue-700/40"
            >
              Reset width
            </Button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-blue-700/40"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4 text-blue-100" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact metadata section with minimal styling
 */
function ProgramMetadataGrid({
  program,
  detail,
}: {
  program: AIPEntry
  detail: ProgramDetailRecord | null
}) {
  const programData = program as ProgramOverviewEntry
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
  const createdIso = detail?.createdAt ?? programData.created_date
  const updatedIso = detail?.updatedAt ?? programData.updated_date
  const createdDate = createdIso
    ? new Date(createdIso).toLocaleDateString("en-US", dateFormatOptions)
    : "—"
  const updatedDate = updatedIso
    ? new Date(updatedIso).toLocaleDateString("en-US", dateFormatOptions)
    : "—"

  const startMonth = detail?.implementationStartMonth ?? program.implementationStartMonth
  const startYear = detail?.implementationStartYear ?? program.implementationStartYear
  const endMonth = detail?.implementationEndMonth ?? program.implementationEndMonth
  const endYear = detail?.implementationEndYear ?? program.implementationEndYear
  const startLabel = formatMonthYear(startMonth, startYear)
  const endLabel = formatMonthYear(endMonth, endYear)
  const implPeriodLabel = startLabel && endLabel
    ? `${startLabel} – ${endLabel}`
    : startLabel || endLabel || ""

  // The API sends the office's name with every entry (`office_name`). An entry
  // without one has no office, so there is nothing to look an id up against.
  const explicitDepartmentName = (programData.department_name || programData.departmentName || programData.department || "").trim()
  const deptDisplay = programData.office_name || explicitDepartmentName

  const rawSector = String(programData.sector || "").trim()
  const derivedSector = rawSector || String(program.program_code || "").split("-")[0] || ""
  const sectorDisplay = detail?.papSector
    ? `${detail.papSector.code} - ${detail.papSector.name}`
    : derivedSector || "Not specified"

  const supportingOffices = detail?.supportingOffices?.map((r) => r.office)
    ?? program.supportingOffices
    ?? []

  const sdgGoals = detail?.sdgGoals?.map((r) => r.sdgGoal) ?? []

  // Null on programs predating the field; the row says so rather than hiding,
  // since an unclassified program still exports under Operations.
  const classificationLabel = papClassLabel(detail?.papClass)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Administrative Details
      </h3>
      <dl>
        <MetaRow label="Implementing Office">
          {deptDisplay || <span className="italic text-slate-400">Not specified</span>}
        </MetaRow>
        <MetaRow label="Classification">
          {classificationLabel ?? (
            <span className="italic text-slate-400">Not classified</span>
          )}
        </MetaRow>
        <MetaRow label="Sector">{sectorDisplay}</MetaRow>
        {supportingOffices.length > 0 && (
          <MetaRow label="Supporting Offices">
            <div className="flex flex-wrap gap-1.5">
              {supportingOffices.map((office) => (
                <span
                  key={office.id}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                >
                  {office.acronym && (
                    <span className="font-mono font-semibold text-slate-500">{office.acronym}</span>
                  )}
                  <span>{office.name}</span>
                </span>
              ))}
            </div>
          </MetaRow>
        )}
        <MetaRow label="Implementation">
          {implPeriodLabel || <span className="italic text-slate-400">Not specified</span>}
        </MetaRow>
        {sdgGoals.length > 0 && (
          <MetaRow label="SDG Goals">
            <div className="flex flex-wrap gap-1.5">
              {sdgGoals.map((goal) => (
                <span
                  key={goal.id}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                >
                  <span className="font-mono font-semibold text-slate-500">{goal.code}</span>
                  <span>{goal.name}</span>
                </span>
              ))}
            </div>
          </MetaRow>
        )}
        {detail?.sglgIndicator && (
          <MetaRow label="SGLG Indicator">
            <span className="font-mono font-semibold text-slate-500">{detail.sglgIndicator.code}</span>
            {" — "}{detail.sglgIndicator.name}
            <span className="ml-1.5 text-xs text-slate-500">({detail.sglgIndicator.pillar})</span>
          </MetaRow>
        )}
        <MetaRow label="Created">{createdDate}</MetaRow>
        <MetaRow label="Updated">{updatedDate}</MetaRow>
      </dl>
    </section>
  )
}

/**
 * Description section with MFO highlight
 */
function DescriptionAndMFO({
  program,
  detail,
}: {
  program: AIPEntry
  detail: ProgramDetailRecord | null
}) {
  const programData = program as ProgramOverviewEntry
  const description = (detail?.description || program.ppa_description || program.program_name || "").trim()
  const mfo = (detail?.expectedOutput || programData.expected_output_mfo || "").trim()

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Description
        </h3>
        <p className="text-sm leading-6 text-slate-700">
          {description}
        </p>
      </div>

      {mfo && (
        <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
            Expected Output / MFO
          </p>
          <p className="text-sm font-medium leading-6 text-blue-950">{mfo}</p>
        </div>
      )}
    </section>
  )
}

/**
 * Finish lines with minimal styling
 */
function FinishLinesSection({
  program,
  detail,
}: {
  program: AIPEntry
  detail: ProgramDetailRecord | null
}) {
  const primaryLabel = detail?.finishLine?.name ?? program.finishLineName ?? getFinishLineLabel(program.primary_finish_line_id)
  const secondaryLabel = program.secondary_finish_line_id
    ? getFinishLineLabel(program.secondary_finish_line_id)
    : null
  const hasSecondary = !!secondaryLabel && secondaryLabel !== "-"
  const subFinishLineName = detail?.subFinishLine?.name ?? program.subFinishLineName ?? null

  const primaryVisionNumber = detail?.finishLine?.visionNumber ?? program.finishLineVisionNumber ?? null

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {GOALS}
      </h3>

      <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="mb-0.5 text-xs font-medium text-slate-500">
              Primary{primaryVisionNumber != null ? ` · #${primaryVisionNumber}` : ''}
            </p>
            <p className="text-sm font-semibold text-slate-950">{primaryLabel}</p>
          </div>
        </div>
        {subFinishLineName && (
          <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2">
            <span className="text-xs font-medium text-slate-500">Sub:</span>
            <span className="text-xs text-slate-700">{subFinishLineName}</span>
          </div>
        )}
      </div>

      {hasSecondary && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex-1">
            <p className="mb-0.5 text-xs font-semibold text-amber-700">
              Secondary
            </p>
            <p className="text-sm font-semibold text-slate-950">{secondaryLabel}</p>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * A program's own directly-applied thematic tags (read-only). A program row
 * never carries inherited tags — only its PAs do (see
 * `ProjectActivityThematicTagsSection`) — so this never distinguishes direct
 * from inherited.
 */
function ThematicTagsSection({
  detail,
}: {
  detail: ProgramDetailRecord | null
}) {
  const tags = detail?.thematicTags ?? []

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Thematic Tags
      </h3>
      {detail === null ? (
        // `detail` is cleared on open and only set once getProgramDetail
        // resolves — null means still loading, not "confirmed empty", so a
        // skeleton goes here instead of flashing "No tags applied" first.
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
        </div>
      ) : tags.length > 0 ? (
        <ThematicTagBadges tags={tags} />
      ) : (
        <p className="text-sm italic text-slate-400">No tags applied</p>
      )}
    </section>
  )
}

/**
 * Multi-finish warning - more prominent
 */
function MultiFinishWarning({
  program,
}: {
  program: AIPEntry
}) {
  const hasSecondary = !!program.secondary_finish_line_id

  if (!hasSecondary) return null

  return (
    <section className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Multiple {GOALS} Assigned
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            Programs should typically align to one primary {goal}. Verify this is intentional.
          </p>
        </div>
    </section>
  )
}

/**
 * Sub-items as card list matching the AIP registry card view
 */
export function SubItemsSummary({
  program,
  onAddActivity,
  onOpen,
  programId,
  canReorder = false,
}: {
  program: AIPEntry
  onAddActivity?: (projectId: string) => void
  onOpen?: (item: AIPEntry) => void
  /** Owning program. Required for reordering — the API scopes the write to it. */
  programId?: string
  /** Show the reorder affordance. Callers gate this on edit permission. */
  canReorder?: boolean
}) {
  const [showBreakdown, setShowBreakdown] = useState(true)
  // Local order while reordering; committed to the server on save. Falls back
  // to the server-supplied order whenever the incoming children change.
  const [draftItems, setDraftItems] = useState<AIPEntry[] | null>(null)
  const [reordering, setReordering] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)

  const serverItems = program.children || []
  const items = draftItems ?? serverItems
  const projectCount = items.filter((i) => i.ppa_type === "Project").length
  const activityCount = items.filter((i) => i.ppa_type === "Activity").length
  const totalSubItems = projectCount + activityCount

  // A Program's children are its root-level PAs (parent = null); a Project's
  // children are activities nested under it.
  const parentProjectActivityId =
    program.ppa_type === "Program" ? null : program.id
  const reorderEnabled = canReorder && !!programId && totalSubItems > 1
  const orderDirty =
    draftItems !== null &&
    draftItems.some((item, index) => item.id !== serverItems[index]?.id)

  function moveItem(from: number, to: number) {
    if (from === to) return
    setDraftItems((prev) => {
      const base = prev ?? serverItems
      const next = [...base]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setReorderError(null)
  }

  async function saveOrder() {
    if (!programId || !draftItems) return
    setSavingOrder(true)
    setReorderError(null)
    const result = await reorderProjectActivities(
      programId,
      draftItems.map((item) => item.id),
      parentProjectActivityId,
    )
    setSavingOrder(false)
    if ("error" in result) {
      setReorderError(result.error)
      return
    }
    // The server renumbered the codes; reflect them without a full refetch.
    const codeById = new Map(
      result.rows.map((row) => [row.id, row.tentativeAipReferenceCode]),
    )
    setDraftItems((prev) =>
      (prev ?? []).map((item) => ({
        ...item,
        program_code: codeById.get(item.id) ?? item.program_code,
      })),
    )
    setReordering(false)
  }

  function cancelReorder() {
    setDraftItems(null)
    setReordering(false)
    setReorderError(null)
  }

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const defaultExpanded = new Set<string>()
    for (const item of items) {
      if (item.ppa_type === "Project" && item.children && item.children.length > 0) {
        defaultExpanded.add(item.id)
      }
    }
    return defaultExpanded
  })

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fmtBreakdown = (v: string) => {
    const n = parseFloat(v)
    return !n ? "—" : formatCurrency(v)
  }

  if (totalSubItems === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Sub-Items (0)
        </h3>
        <p className="text-sm text-slate-500">None</p>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Sub-Items ({totalSubItems})
        </h3>
        {reorderEnabled && (
          <button
            type="button"
            onClick={() => (reordering ? cancelReorder() : setReordering(true))}
            className={cn(
              "mr-auto ml-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              reordering
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {reordering ? "Done" : "Reorder"}
          </button>
        )}
        <div
          role="group"
          aria-label="Column breakdown visibility"
          className="inline-flex shrink-0 rounded-md border border-slate-300 bg-slate-50 p-0.5"
        >
          <button
            type="button"
            aria-pressed={showBreakdown}
            onClick={() => setShowBreakdown(true)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              showBreakdown
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800',
            )}
          >
            Full
          </button>
          <button
            type="button"
            aria-pressed={!showBreakdown}
            onClick={() => setShowBreakdown(false)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              !showBreakdown
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800',
            )}
          >
            Compact
          </button>
        </div>
      </div>

      {reordering && (
        <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Drag a row, or use the arrows, to change its order. The AIP code of
          every item below is renumbered when you save.
        </p>
      )}
      {reorderError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {reorderError}
        </p>
      )}

      <div className="space-y-2">
        {items.map((item, index) => {
          const isProject = item.ppa_type === "Project"
          const hasChildren = !!(item.children && item.children.length > 0)
          const isExpanded = expandedIds.has(item.id)
          const showToggle = hasChildren || isProject
          const title = item.program_name || item.ppa_description || "Unnamed"

          return (
            <div
              key={item.id}
              draggable={reordering}
              onDragStart={reordering ? () => setDragIndex(index) : undefined}
              onDragOver={reordering ? (e) => e.preventDefault() : undefined}
              onDrop={
                reordering
                  ? () => {
                      if (dragIndex !== null) moveItem(dragIndex, index)
                      setDragIndex(null)
                    }
                  : undefined
              }
              onDragEnd={reordering ? () => setDragIndex(null) : undefined}
              className={cn(
                "overflow-hidden rounded-lg border border-slate-200",
                reordering && "cursor-grab",
                reordering && dragIndex === index && "border-blue-300 bg-blue-50",
              )}
            >
              {reordering && (
                <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1">
                  <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[10px] font-medium tabular-nums text-slate-500">
                    {index + 1}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    aria-label={`Move ${title} up`}
                    disabled={index === 0}
                    onClick={() => moveItem(index, index - 1)}
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${title} down`}
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, index + 1)}
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {/* Card header — opening is suppressed while reordering, so a
                  drag that ends on the card doesn't navigate away. */}
              <div
                role={onOpen && !reordering ? "button" : undefined}
                tabIndex={onOpen && !reordering ? 0 : undefined}
                onClick={onOpen && !reordering ? () => onOpen(item) : undefined}
                onKeyDown={onOpen && !reordering ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item) } } : undefined}
                className={cn(
                  "px-4 py-3.5 transition-colors",
                  onOpen && !reordering ? "cursor-pointer hover:bg-blue-50/40" : "hover:bg-slate-50"
                )}
              >
                {/* Title row */}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span className={cn(
                        "min-w-0 flex-1 text-sm leading-snug",
                        isProject ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                      )}>
                        {title}
                      </span>
                      <span className={cn(
                        "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
                        getTypeBadgeClass(item.ppa_type)
                      )}>
                        {item.ppa_type}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                      {item.program_code}
                    </p>
                  </div>

                  {showToggle && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(item.id) }}
                      aria-expanded={hasChildren ? isExpanded : undefined}
                      aria-hidden={!hasChildren ? true : undefined}
                      className={cn(
                        "flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md transition-colors",
                        hasChildren ? "hover:bg-slate-100" : "cursor-default opacity-30"
                      )}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Status */}
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      getProgramStatusBorderedClass(item.status_label ?? item.status)
                    )}
                  >
                    {item.status_label ?? item.status}
                  </Badge>
                </div>

                {/* Separator */}
                <div className="mt-2.5 border-t border-slate-100" />

                {/* Budget + Actions */}
                <div className="mt-2.5 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Total</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {formatCurrency(item.total_amount)}
                    </p>
                    {showBreakdown && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-xs tabular-nums text-slate-500">
                        <span>PS {fmtBreakdown(item.ps_amount)}</span>
                        <span>MOOE {fmtBreakdown(item.mooe_amount)}</span>
                        <span>FE {fmtBreakdown(item.fe_amount)}</span>
                        <span>CO {fmtBreakdown(item.co_amount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isProject && onAddActivity && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => { e.stopPropagation(); onAddActivity(item.id) }}
                      >
                        + Activity
                      </Button>
                    )}
                    {onOpen && <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>
              </div>

              {/* Expanded child activities */}
              {hasChildren && isExpanded && (
                <div className="border-t border-slate-100">
                  {item.children!.map((child) => (
                    <div
                      key={child.id}
                      role={onOpen ? "button" : undefined}
                      tabIndex={onOpen ? 0 : undefined}
                      onClick={onOpen ? () => onOpen(child) : undefined}
                      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(child) } } : undefined}
                      className={cn(
                        "border-t border-slate-100 px-4 py-3 first:border-t-0 bg-slate-50/50 transition-colors",
                        onOpen ? "cursor-pointer hover:bg-blue-50/40" : "hover:bg-slate-50/80"
                      )}
                    >
                      <div className="flex items-start gap-2 pl-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-1.5">
                            <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
                              {child.program_name || child.ppa_description || "Unnamed"}
                            </span>
                            <span className={cn(
                              "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
                              getTypeBadgeClass(child.ppa_type)
                            )}>
                              {child.ppa_type}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                            {child.program_code}
                          </p>
                        </div>
                        {onOpen && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
                      </div>

                      <div className="ml-4 mt-2 border-t border-slate-100" />

                      <div className="mt-2 pl-4">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(child.total_amount)}
                        </p>
                        {showBreakdown && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-xs tabular-nums text-slate-500">
                            <span>PS {fmtBreakdown(child.ps_amount)}</span>
                            <span>MOOE {fmtBreakdown(child.mooe_amount)}</span>
                            <span>FE {fmtBreakdown(child.fe_amount)}</span>
                            <span>CO {fmtBreakdown(child.co_amount)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reordering && orderDirty && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-600">Order changed</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={cancelReorder}
            disabled={savingOrder}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={saveOrder}
            disabled={savingOrder}
          >
            {savingOrder ? "Saving…" : "Save order"}
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * Compact budget summary
 */
function BudgetSummarySection({
  program,
}: {
  program: AIPEntry
}) {
  // ponytail: no ceiling here. A finish-line ceiling caps every program on that
  // finish line together, so one program against it says nothing; the honest
  // pool check is the server's advisory ceiling warning at publish
  // (program-publish.service.ts `ceilingWarnings`).
  const total = program.total_amount || "0"
  // A zero proposed figure is "not stated", as before; any non-zero digit means
  // a real amount. Tested on the string so the money never becomes a float.
  const proposed = /[1-9]/.test(program.proposedBudget ?? "") ? program.proposedBudget! : null

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Budget Summary
      </h3>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/40">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-slate-600">Program Budget Summary</p>
            {proposed !== null && (
              <p className="mt-0.5 text-xs text-slate-500">
                Proposed: <span className="font-medium tabular-nums text-slate-700">{formatCurrency(proposed)}</span>
              </p>
            )}
          </div>
          <p className="text-2xl font-semibold leading-none tabular-nums text-slate-950">
            {formatCurrency(total)}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-slate-200 text-center">
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">PS</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(program.ps_amount)}
            </p>
          </div>
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">MOOE</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(program.mooe_amount)}
            </p>
          </div>
          <div className="border-r border-slate-200 px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">FE</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(program.fe_amount)}
            </p>
          </div>
          <div className="px-2 sm:px-3 py-2.5">
            <p className="mb-1 text-[10px] sm:text-xs text-slate-500">CO</p>
            <p className="text-[11px] sm:text-sm font-medium tabular-nums text-slate-950 break-all">
              {formatCurrency(program.co_amount)}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Optional remarks
 */
function RemarksSection({
  program,
  detail,
}: {
  program: AIPEntry
  detail: ProgramDetailRecord | null
}) {
  const remarks = detail?.remarks ?? (program as ProgramOverviewEntry).remarks

  if (!remarks) return null

  return (
    <section className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50/70 p-3">
        <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-800" />
        <div>
          <p className="text-sm font-semibold text-yellow-900">
            Remarks
          </p>
          <p className="mt-1 text-xs leading-5 text-yellow-800">{remarks}</p>
        </div>
    </section>
  )
}

/**
 * Per-office endorsement status chips for the program's current version.
 * When the viewer is the HEAD of an office with a PENDING row (and the
 * program is HEAD_REVIEWED), an Endorse / Reject control is shown for it.
 */
function EndorsementPanel({
  programId,
  loadEndorsements,
  refreshKey,
}: {
  programId: string
  loadEndorsements: (id: string) => Promise<{ version: number; endorsements: ProgramEndorsementRecord[] } | { error: string }>
  refreshKey?: number
}) {
  const [rows, setRows] = useState<ProgramEndorsementRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadEndorsements(programId)
      .then((r) => {
        if (cancelled) return
        if ('endorsements' in r) setRows(r.endorsements)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [programId, loadEndorsements, refreshKey])

  if (!loaded || rows.length === 0) return null

  // Read-only here: endorsement is recorded at-will from the dedicated endorse
  // view (/aip-registry/endorse). The drawer just surfaces who has concurred.
  // Endorsements are affirmative-only — every row means "Endorsed".
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Endorsements</span>
      </div>
      <ul className="divide-y divide-slate-50">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-700">
                {endorserLabel(row)}
              </p>
              {row.notes && (
                <p className="truncate text-[10px] text-slate-400">{row.notes}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              Endorsed
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Per-LFC-member-office approval status chips for the program's current
 * version. When the viewer is the HEAD of a member office with a PENDING row
 * (and the program is PENDING_APPROVAL), an Approve / Reject control is shown.
 * Rejection returns the program to FOR_REVISION; unanimous approval finalizes.
 */
function LfcCommitteePanel({
  programId,
  loadApprovals,
  refreshKey,
  currentUserOfficeId,
  rawProgramStatus,
  decideApproval,
  onDecided,
}: {
  programId: string
  loadApprovals: (id: string) => Promise<{ version: number; approvals: ProgramApprovalRecord[] } | { error: string }>
  refreshKey?: number
  currentUserOfficeId?: string | null
  rawProgramStatus?: string
  decideApproval?: (
    programId: string,
    officeId: string,
    status: 'APPROVED' | 'RETURNED' | 'REJECTED',
    notes?: string,
  ) => Promise<{ success: string } | { error: string }>
  onDecided?: () => void
}) {
  const [rows, setRows] = useState<ProgramApprovalRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState<{ officeId: string; status: 'APPROVED' | 'RETURNED' | 'REJECTED' } | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, startWork] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadApprovals(programId)
      .then((r) => {
        if (cancelled) return
        if ('approvals' in r) setRows(r.approvals)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [programId, loadApprovals, refreshKey])

  if (!loaded || rows.length === 0) return null

  const statusStyle: Record<string, string> = {
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    RETURNED: "border-amber-200 bg-amber-50 text-amber-700",
    REJECTED: "border-red-200 bg-red-50 text-red-700",
    PENDING: "border-slate-200 bg-slate-50 text-slate-500",
  }
  const statusLabel: Record<string, string> = {
    APPROVED: "Approved",
    RETURNED: "Returned",
    REJECTED: "Rejected",
    PENDING: "Pending",
  }

  const canDecide = (row: ProgramApprovalRecord) =>
    !!decideApproval &&
    rawProgramStatus === 'PENDING_APPROVAL' &&
    row.status === 'PENDING' &&
    !!currentUserOfficeId &&
    row.office.id === currentUserOfficeId

  const confirmDecision = () => {
    if (!pending || !decideApproval) return
    setError(null)
    startWork(async () => {
      const r = await decideApproval(programId, pending.officeId, pending.status, notes.trim() || undefined)
      if ('error' in r) { setError(r.error); return }
      setPending(null)
      setNotes('')
      onDecided?.()
    })
  }

  const committeeName = rows[0]?.committee?.name ?? 'LFC Committee'

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {committeeName}
        </span>
      </div>
      <ul className="divide-y divide-slate-50">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-700">
                {row.office.name}
              </p>
              {row.notes && (
                <p className="truncate text-[10px] text-slate-400">{row.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canDecide(row) && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="h-6 px-2 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => { setPending({ officeId: row.office.id, status: 'APPROVED' }); setNotes(''); setError(null) }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="h-6 px-2 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => { setPending({ officeId: row.office.id, status: 'RETURNED' }); setNotes(''); setError(null) }}
                  >
                    Return
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="h-6 px-2 text-[10px] border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => { setPending({ officeId: row.office.id, status: 'REJECTED' }); setNotes(''); setError(null) }}
                  >
                    Reject
                  </Button>
                </>
              )}
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  statusStyle[row.status] ?? statusStyle.PENDING,
                )}
              >
                {statusLabel[row.status] ?? row.status}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pending?.status === 'APPROVED'
                ? 'Approve Program'
                : pending?.status === 'RETURNED'
                  ? 'Return for Revision'
                  : 'Reject Program'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-slate-600">
              {pending?.status === 'APPROVED'
                ? 'Record your office’s approval. When every member office has approved, the program is finalized.'
                : pending?.status === 'RETURNED'
                  ? 'Returning sends the program to FOR_REVISION so the proponent can revise and resubmit. Your notes open a comment thread they must resolve.'
                  : 'Rejecting is terminal — the program moves to REJECTED and never receives a final AIP code. Use Return instead if the proponent should revise and resubmit.'}
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {pending?.status === 'APPROVED' ? 'Notes (optional)' : 'Reason (required)'}
              </label>
              <Textarea
                placeholder="Optional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[70px] resize-none text-sm"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              className={pending?.status === 'APPROVED'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : pending?.status === 'RETURNED'
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-red-600 text-white hover:bg-red-700'}
              disabled={busy || (pending?.status !== 'APPROVED' && !notes.trim())}
              onClick={confirmDecision}
            >
              {busy
                ? 'Processing…'
                : pending?.status === 'APPROVED'
                  ? 'Approve'
                  : pending?.status === 'RETURNED'
                    ? 'Return'
                    : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** Author / resolver identity line: name · office · role · time. */
function ActorLine({ actor, at }: { actor?: CommentActor | null; at: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-xs font-semibold text-slate-800">
        {actor?.name ?? "Unknown user"}
      </span>
      {actor?.office && (
        <span className="text-[10px] text-slate-500">· {actor.office}</span>
      )}
      {actor?.role && (
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          · {ROLE_LABEL[actor.role] ?? actor.role}
        </span>
      )}
      <span className="text-[10px] text-slate-400">· {at}</span>
    </div>
  )
}

/**
 * One comment thread: a root comment, its replies, a resolve toggle, and an
 * inline reply composer.
 */
function CommentThread({
  comment,
  currentUserId,
  busy,
  onReply,
  onResolve,
  onDelete,
}: {
  comment: ProgramComment
  currentUserId?: string
  busy: boolean
  onReply?: (parentId: string, content: string) => void
  onResolve?: (commentId: string, resolved: boolean) => void
  onDelete?: (commentId: string) => void
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState("")
  const resolved = !!comment.resolvedAt
  const replies = comment.replies ?? []

  const submitReply = () => {
    if (!onReply || !replyText.trim()) return
    onReply(comment.id, replyText.trim())
    setReplyText("")
    setReplyOpen(false)
  }

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        resolved ? "border-emerald-100 bg-emerald-50/40" : "border-slate-100 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <ActorLine actor={comment.author} at={formatAt(comment.createdAt)} />
        <div className="flex items-center gap-1.5">
          {comment.stage && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
              {STAGE_LABEL[comment.stage] ?? comment.stage}
            </span>
          )}
          {currentUserId && comment.authorUserId === currentUserId && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="text-slate-300 transition-colors hover:text-red-500"
              title="Delete comment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
        {comment.content}
      </p>

      {resolved && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          Resolved{comment.resolvedBy ? ` by ${comment.resolvedBy.name}` : ""}
        </p>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-slate-100 pl-2.5">
          {replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center gap-1">
                <CornerDownRight className="h-3 w-3 shrink-0 text-slate-300" />
                <ActorLine actor={reply.author} at={formatAt(reply.createdAt)} />
              </div>
              <p className="ml-4 mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Thread actions */}
      <div className="mt-1.5 flex items-center gap-3">
        {onReply && (
          <button
            type="button"
            onClick={() => setReplyOpen((v) => !v)}
            className="text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            Reply
          </button>
        )}
        {onResolve && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(comment.id, !resolved)}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium transition-colors disabled:opacity-50",
              resolved
                ? "text-slate-500 hover:text-slate-800"
                : "text-emerald-600 hover:text-emerald-800",
            )}
          >
            {resolved ? (
              <>
                <RotateCcw className="h-3 w-3" /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </>
            )}
          </button>
        )}
      </div>

      {replyOpen && onReply && (
        <div className="mt-2">
          <Textarea
            placeholder="Write a reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[48px] resize-none text-xs"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => { setReplyOpen(false); setReplyText("") }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 px-2.5 text-[10px]"
              disabled={!replyText.trim() || busy}
              onClick={submitReply}
            >
              Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Non-comment timeline rows (endorsement / verdict). */
function TimelineRow({ event }: { event: ActivityEvent }) {
  const pl = event.payload
  const at = formatAt(event.at)

  if (event.kind === "endorsement") {
    const office =
      (pl.endorserType as string) === "NCPC"
        ? (pl.endorserCso as { name?: string } | null)?.name
          ? `NCPC — ${(pl.endorserCso as { name: string }).name}`
          : "NCPC"
        : ((pl.endorserOffice as Record<string, string> | null | undefined)
            ?.acronym ?? "Office")
    // Endorsements are affirmative-only — a row means "endorsed".
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-slate-500">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span>{`${office} endorsed`}</span>
        <span className="ml-auto text-[10px]">{at}</span>
      </div>
    )
  }

  if (event.kind === "verdict") {
    const verdict = pl.verdict as string
    // VerdictType is APPROVE-only since the endorser pivot (the SUPER_ADMIN
    // INCREASE/DECREASE/REJECT path was removed in OD-3 and the values were
    // pruned from the enum). The `?? verdict` fallbacks below still render any
    // unmapped legacy value gracefully.
    const labelMap: Record<string, string> = {
      APPROVE: "Approved",
    }
    const colorMap: Record<string, string> = {
      APPROVE: "bg-emerald-500",
    }
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs">
        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", colorMap[verdict] ?? "bg-slate-300")} />
        <span className="font-medium text-slate-700">{labelMap[verdict] ?? verdict}</span>
        {pl.amountSuggested != null && (
          <span className="text-slate-500">₱{String(pl.amountSuggested)}</span>
        )}
        <span className="ml-auto text-[10px] text-slate-400">{at}</span>
      </div>
    )
  }

  return null
}

function parseFeedbackContent(content: string): { author: string; message: string } {
  const match = /^\[From: ([^\]]+)\]\n\n([\s\S]*)$/.exec(content);
  if (match) return { author: match[1], message: match[2] };
  return { author: 'Anonymous', message: content };
}

export function PublicFeedbackPanel({
  programId,
  loadPublicFeedback,
  refreshKey,
}: {
  programId: string
  loadPublicFeedback: (id: string) => Promise<PublicFeedbackItem[] | { error: string }>
  refreshKey?: number
}) {
  const [items, setItems] = useState<PublicFeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const r = await loadPublicFeedback(programId)
      if (cancelled) return
      if ('error' in r) { setError(r.error); setLoading(false); return }
      setItems(r)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [programId, loadPublicFeedback, refreshKey])

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Public Feedback{items.length > 0 ? ` (${items.length})` : ''}
        </span>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-1 rounded-md border border-slate-100 p-2.5">
                <div className="h-2.5 w-1/3 rounded bg-slate-200" />
                <div className="h-2.5 w-full rounded bg-slate-200" />
                <div className="h-2.5 w-4/5 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-xs italic text-slate-400">No public feedback submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const { author, message } = parseFeedbackContent(item.content)
              return (
                <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800">{author}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{message}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Activity stream & threaded comment section.
 */
function ActivitySection({
  programId,
  currentUserId,
  loadActivityStream,
  postComment,
  loadCommentPermission,
  deleteComment,
  resolveComment,
  activityRefreshKey,
  onUnresolvedCountChange,
}: {
  programId: string
  currentUserId?: string
  loadActivityStream?: (id: string) => Promise<{ events: ActivityEvent[] } | { error: string }>
  postComment?: (id: string, payload: CreateCommentPayload) => Promise<{ comment: ProgramComment } | { error: string }>
  loadCommentPermission?: (id: string) => Promise<{ canComment: boolean } | { error: string }>
  deleteComment?: (commentId: string) => Promise<{ success: string } | { error: string }>
  resolveComment?: (commentId: string, resolved: boolean, note?: string, reply?: string) => Promise<{ comment: ProgramComment } | { error: string }>
  activityRefreshKey?: number
  onUnresolvedCountChange?: (count: number) => void
}) {
  type StreamState = { events: ActivityEvent[]; loading: boolean; error: string | null }
  type StreamAction =
    | { type: 'loaded'; events: ActivityEvent[] }
    | { type: 'failed'; error: string }
  function streamReducer(prev: StreamState, action: StreamAction): StreamState {
    if (action.type === 'loaded') return { events: action.events, loading: false, error: null }
    return { events: prev.events, loading: false, error: action.error }
  }
  const [{ events, loading, error }, dispatch] = useReducer(streamReducer, {
    events: [],
    loading: !!loadActivityStream,
    error: null,
  })
  const [commentText, setCommentText] = useState('')
  const [busy, startWork] = useTransition()
  // Composer visibility: hidden unless the backend confirms the caller may post
  // (owner, authorized endorser, LFC reviewer, or admin). Keyed by programId so a
  // stale result never shows the composer for a newly-selected program. Defaults
  // to allowed when no permission loader is wired so legacy callers keep it.
  const [perm, setPerm] = useState<{ programId: string; canComment: boolean } | null>(null)
  useEffect(() => {
    if (!loadCommentPermission) return
    let cancelled = false
    void loadCommentPermission(programId).then((r) => {
      if (!cancelled && 'canComment' in r) setPerm({ programId, canComment: r.canComment })
    })
    return () => { cancelled = true }
  }, [programId, loadCommentPermission])
  const canComment = !loadCommentPermission
    ? true
    : perm?.programId === programId && perm.canComment

  const refresh = async () => {
    if (!loadActivityStream) return
    const fresh = await loadActivityStream(programId)
    if ('events' in fresh) dispatch({ type: 'loaded', events: fresh.events })
  }

  useEffect(() => {
    if (!loadActivityStream) return
    let cancelled = false
    loadActivityStream(programId)
      .then((r) => {
        if (cancelled) return
        if ('error' in r) dispatch({ type: 'failed', error: r.error })
        else dispatch({ type: 'loaded', events: r.events })
      })
      .catch(() => { if (!cancelled) dispatch({ type: 'failed', error: 'Failed to load activity.' }) })
    return () => { cancelled = true }
  }, [programId, loadActivityStream, activityRefreshKey])

  // Surface the open-thread count so the footer can gate submission.
  const unresolvedCount = events.filter(
    (e) => e.kind === 'comment' && !(e.payload as { resolvedAt?: string | null }).resolvedAt,
  ).length
  useEffect(() => {
    onUnresolvedCountChange?.(unresolvedCount)
  }, [unresolvedCount, onUnresolvedCountChange])

  const handlePost = () => {
    if (!postComment || !commentText.trim()) return
    const content = commentText.trim()
    startWork(async () => {
      const r = await postComment(programId, { content })
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      setCommentText('')
      await refresh()
    })
  }

  const handleReply = (parentId: string, content: string) => {
    if (!postComment) return
    startWork(async () => {
      const r = await postComment(programId, { content, parentCommentId: parentId })
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  const handleResolve = (commentId: string, resolved: boolean) => {
    if (!resolveComment) return
    startWork(async () => {
      const r = await resolveComment(commentId, resolved)
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  const handleDelete = (commentId: string) => {
    if (!deleteComment) return
    startWork(async () => {
      const r = await deleteComment(commentId)
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  if (!loadActivityStream) return null

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity &amp; Comments</span>
        {unresolvedCount > 0 && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {unresolvedCount} open
          </span>
        )}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && events.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">No activity yet.</p>
        )}
        {events.map((ev, i) =>
          ev.kind === 'comment' ? (
            <CommentThread
              key={(ev.payload as { id?: string }).id ?? i}
              comment={ev.payload as unknown as ProgramComment}
              currentUserId={currentUserId}
              busy={busy}
              onReply={postComment ? handleReply : undefined}
              onResolve={resolveComment ? handleResolve : undefined}
              onDelete={deleteComment ? handleDelete : undefined}
            />
          ) : (
            <TimelineRow key={i} event={ev} />
          ),
        )}
        {!!error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      {postComment && canComment && (
        <div className="border-t border-slate-100 px-3 py-2.5">
          <Textarea
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="min-h-[60px] resize-none text-xs"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={!commentText.trim() || busy}
              onClick={handlePost}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Compact sticky footer
 */
function ProgramOverviewFooter({
  program,
  onAddProject,
  onAddActivity,
  onSubmit,
  onHeadReview,
  rawProgramStatus,
  isSubmitting,
  unresolvedCount = 0,
  onRequestDelete,
  showCompare,
  canPublish = false,
  canWrite = false,
  isSuperAdmin = false,
  publishedVersion,
  onPublishChanged,
  compact = false,
  onEdit,
}: {
  program: AIPEntry
  /** Drawer is too narrow for labels — footer actions render icon-only. */
  compact?: boolean
  onAddProject?: (programId: string) => void
  onAddActivity?: (programId: string) => void
  onSubmit?: (programId: string) => void
  onHeadReview?: (programId: string) => void
  rawProgramStatus?: string
  isSubmitting?: boolean
  unresolvedCount?: number
  onRequestDelete?: () => void
  showCompare?: boolean
  /** Toggles the drawer's own edit mode in place of `router.push`. */
  onEdit?: () => void
  canPublish?: boolean
  canWrite?: boolean
  isSuperAdmin?: boolean
  publishedVersion?: number | null
  onPublishChanged?: () => void
}) {
  const router = useRouter()

  // Mirror the API's two constants exactly, or the menu ends up disabled for
  // actions the server would happily accept. Both sets now live in one place
  // (lib/program-status.ts) so they can't drift apart again.
  const statusSource =
    rawProgramStatus ?? ((program.status_label ?? program.status) || '').toString()

  // EDITABLE_PROGRAM_STATUSES — a revision is open, so fields are editable again.
  const canEditFields = isEditableProgramStatus(statusSource)
  // A published AIP is locked as a budget document; the way in is a revision.
  const mustReviseFirst = rawProgramStatus === 'PUBLISHED'
  // DELETABLE_PROGRAM_STATUSES, plus the SUPER_ADMIN override the service allows.
  // An archived program is kept for its history — the API refuses its delete
  // even for SUPER_ADMIN (specs/013).
  const canDelete =
    rawProgramStatus !== 'ARCHIVED' &&
    (isDeletableProgramStatus(statusSource) || isSuperAdmin)

  return (
    <>
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 shadow-sm">
        {/* Phase 1 publish lifecycle (screens 2 and 3). Keys off raw status, so
            it renders nothing for the legacy approval states. APPROVED is here
            because it is the end of the workflow and the service publishes it:
            the enacted 2026 book is APPROVED throughout and unpublished, and
            without this there is no button anywhere to make it public. */}
        {(rawProgramStatus === 'DRAFT' ||
          rawProgramStatus === 'APPROVED' ||
          rawProgramStatus === 'PUBLISHED' ||
          rawProgramStatus === 'PUBLISHED_REVISION' ||
          rawProgramStatus === 'ARCHIVED') && (
          <div className="mb-3">
            <PublishPanel
              programId={program.id}
              status={rawProgramStatus}
              publishedVersion={publishedVersion}
              canPublish={canPublish}
              canWrite={canWrite}
              isSuperAdmin={isSuperAdmin}
              archivedReason={program.archivedReason}
              onChanged={onPublishChanged}
              onCompare={
                showCompare
                  ? () => router.push(`/programs/${program.id}/compare`)
                  : undefined
              }
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          {showCompare && (
            <a
              href={`/programs/${program.id}/compare`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare Versions
            </a>
          )}
          {program.status === 'Draft' && onSubmit && unresolvedCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <Lock className="h-3.5 w-3.5" />
              Resolve {unresolvedCount} open comment thread
              {unresolvedCount === 1 ? '' : 's'} before submitting
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {program.status === 'Draft' && onSubmit && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-4 text-sm border-blue-300 text-blue-700 hover:bg-blue-50"
              disabled={isSubmitting || unresolvedCount > 0}
              title={
                unresolvedCount > 0
                  ? 'All comment threads must be resolved before submitting'
                  : undefined
              }
              onClick={() => onSubmit(program.id)}
            >
              {isSubmitting ? 'Submitting…' : 'Submit for Review'}
            </Button>
          )}
          {program.status === 'Submitted' && rawProgramStatus === 'SUBMITTED' && onHeadReview && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-4 text-sm border-green-300 text-green-700 hover:bg-green-50"
              disabled={isSubmitting}
              onClick={() => onHeadReview(program.id)}
            >
              {isSubmitting ? 'Processing…' : 'Mark as Reviewed'}
            </Button>
          )}
          {/* No Close button: the sheet already closes on overlay click, Escape
              and the header ✕. Edit and Delete are no longer buried in a `…`
              menu — they sit in their own group, separated from the primary
              action by a hairline so the row reads as
              "secondary actions | primary action" rather than a wall. */}
          {/* Write actions only for writers: a reviewer (NCPC, a read-only
              Developer, an Office Head on the read template) reads and
              comments, and every one of these would answer 403 (#102). */}
          {onRequestDelete && canWrite && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-2">
              <DrawerActionButton
                icon={Edit}
                label="Edit"
                compact={compact}
                disabled={!canEditFields}
                title={
                  mustReviseFirst
                    ? 'Published — use “Edit this AIP” to open a revision first'
                    : 'Edit'
                }
                onClick={() => canEditFields && onEdit?.()}
              />
              <DrawerActionButton
                icon={Trash2}
                label="Delete"
                compact={compact}
                disabled={!canDelete}
                title={
                  canDelete
                    ? 'Delete'
                    : rawProgramStatus === 'ARCHIVED'
                      ? 'An archived program is kept for its history'
                      : 'A published AIP cannot be deleted'
                }
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => canDelete && onRequestDelete()}
              />
            </div>
          )}

        {(onAddProject || onAddActivity) && canWrite && rawProgramStatus !== 'ARCHIVED' && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 px-3 text-sm gap-1.5"
                  title="Add Project / Activity"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {compact ? 'Add' : 'Add Project / Activity'}
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" sideOffset={6} className="w-48">
              <DropdownMenuItem onClick={() => onAddProject?.(program.id)}>
                Add Project
              </DropdownMenuItem>
              {onAddActivity && (
                <DropdownMenuItem onClick={() => onAddActivity(program.id)}>
                  Add Activity
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
        </div>
    </div>
    </>
  )
}

/**
 * Main Program Overview Drawer
 */
export function ProgramOverviewDrawer({
  isOpen,
  program,
  onClose,
  onAddProject,
  onAddActivity,
  onSubmit,
  onHeadReview,
  rawProgramStatus,
  canPublish,
  canWrite,
  isSuperAdmin,
  canAudit,
  onPublishChanged,
  isSubmitting,
  currentUserId,
  currentUserOfficeId,
  loadActivityStream,
  postComment,
  loadCommentPermission,
  deleteComment,
  resolveComment,
  loadEndorsements,
  loadApprovals,
  decideApproval,
  onApprovalDecided,
  activityRefreshKey,
  onDeleteSuccess,
  onOpenSubItem,
  loadPublicFeedback,
  onAddActivityForProject,
  initialMode = 'view',
  onModeChange,
  onNavigate,
  canNavigatePrev = false,
  canNavigateNext = false,
}: ProgramOverviewDrawerProps) {
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<ProgramTab>("details")
  const [detail, setDetail] = useState<ProgramDetailRecord | null>(null)
  const programId = program?.id ?? null
  // Bumped after a successful edit-mode save so the drawer's own view (not
  // just the registry row) reflects the new values immediately (US5/T028).
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)

  useEffect(() => {
    if (!isOpen || !programId) return
    let cancelled = false
    // Clear previous program's detail before fetching the new one.
    const clearTimer = setTimeout(() => { if (!cancelled) setDetail(null) }, 0)
    getProgramDetail(programId)
      .then((r) => {
        if (cancelled) return
        if ('program' in r) setDetail(r.program)
      })
      .catch(() => { /* keep list-derived fallback */ })
    return () => { cancelled = true; clearTimeout(clearTimer) }
  }, [isOpen, programId, detailRefreshKey])

  // In-place view/edit toggle (US5), replacing the old `router.push
  // ('/programs/:id/edit')`. Resets to 'view' whenever a different program is
  // opened, so switching rows never leaves a stale edit form showing.
  // A deep link asks for edit; honour it only where the footer's Edit button
  // would be enabled, or a published program opens a form the API refuses.
  const startMode =
    initialMode === 'edit' &&
    canWrite &&
    isEditableProgramStatus(rawProgramStatus ?? String(program?.status_label ?? program?.status ?? ''))
      ? 'edit'
      : 'view'
  const [mode, setMode] = useState<'view' | 'edit'>(startMode)
  useEffect(() => {
    if (!isOpen) return
    queueMicrotask(() => setMode(startMode))
  }, [isOpen, programId, startMode])
  const changeMode = (next: 'view' | 'edit') => {
    setMode(next)
    onModeChange?.(next)
  }
  // The edit form's own shape — fetched the same way `/programs/[id]/edit`
  // already did (`/api/programs/:id`, a client-owned same-origin route, not
  // the typed `getProgramDetail` server action) so `NewProgramForm` gets
  // exactly the initialData shape it expects.
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editLoadError, setEditLoadError] = useState(false)
  useEffect(() => {
    if (mode !== 'edit' || !programId) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) { setEditLoading(true); setEditData(null); setEditLoadError(false) } })
    fetch(`/api/programs/${programId}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const message = await res.json().then((body) => body?.message).catch(() => undefined)
          throw new Error(message ?? `Request failed with ${res.status}`)
        }
        return res.json()
      })
      .then((data) => { if (!cancelled) setEditData(data) })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load program for editing:', err)
          setEditLoadError(true)
        }
      })
      .finally(() => { if (!cancelled) setEditLoading(false) })
    return () => { cancelled = true }
  }, [mode, programId])

  const [drawerWidth, setDrawerWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_WIDTH

    const parsed = parseInt(stored, 10)
    return !isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH
      ? parsed
      : DEFAULT_WIDTH
  })
  const [isKeyboardResizeTransition, setIsKeyboardResizeTransition] = useState(false)
  const [showResetToast, setShowResetToast] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const sheetContentRef = useRef<HTMLDivElement>(null)
  const resizeTransitionTimeoutRef = useRef<number | null>(null)
  const resetToastTimeoutRef = useRef<number | null>(null)

  // Persist width changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(drawerWidth))
  }, [drawerWidth])

  useEffect(() => {
    return () => {
      if (resizeTransitionTimeoutRef.current) {
        window.clearTimeout(resizeTransitionTimeoutRef.current)
      }
      if (resetToastTimeoutRef.current) {
        window.clearTimeout(resetToastTimeoutRef.current)
      }
    }
  }, [])

  const [isDeleting, setIsDeleting] = useState(false)
  const handleDeleteProgram = async () => {
    if (!program?.id) return
    setIsDeleting(true)
    try {
      const result = await deleteProgramAction(program.id)
      if (result.success) {
        setIsDeleteConfirmOpen(false)
        onClose()
        onDeleteSuccess?.()
      } else {
        toast.error(result.error)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!program) return null

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768

  const resetWidth = () => {
    localStorage.removeItem(STORAGE_KEY)
    setDrawerWidth(DEFAULT_WIDTH)
    setShowResetToast(true)
    if (resetToastTimeoutRef.current) {
      window.clearTimeout(resetToastTimeoutRef.current)
    }
    resetToastTimeoutRef.current = window.setTimeout(() => {
      setShowResetToast(false)
    }, 1400)
  }

  const handleResize = (newWidth: number, source: ResizeSource) => {
    if (source === "keyboard") {
      setIsKeyboardResizeTransition(true)
      if (resizeTransitionTimeoutRef.current) {
        window.clearTimeout(resizeTransitionTimeoutRef.current)
      }
      resizeTransitionTimeoutRef.current = window.setTimeout(() => {
        setIsKeyboardResizeTransition(false)
      }, 180)
    } else {
      setIsKeyboardResizeTransition(false)
    }
    setDrawerWidth(newWidth)
  }

  // delete action already declared above to preserve hook order
  // (original hook placement caused conditional hook lint errors)

  // Tabs replace one long scroll column. History is audit-gated and public
  // feedback only appears when a loader was supplied, so the strip never offers
  // a tab that would open an empty or forbidden panel. The Comments pill counts
  // open threads only — a resolved thread is not something to act on.
  const programTabs: DrawerTab<ProgramTab>[] = [
    { value: "details", label: "Details" },
    { value: "comments", label: "Comments", count: unresolvedCount },
    ...(loadPublicFeedback
      ? [{ value: "feedback" as const, label: "Public Feedback" }]
      : []),
    ...(canAudit ? [{ value: "history" as const, label: "History" }] : []),
  ]

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        ref={sheetContentRef}
        side="right"
        showCloseButton={false}
        className="p-0 flex flex-col bg-slate-50 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.03] data-[side=right]:sm:max-w-none"
        style={{
          width: isDesktop ? `${drawerWidth}px` : "100%",
          transition: isKeyboardResizeTransition ? "width 160ms ease-out" : "none",
        }}
      >
        {isDesktop && (
          <DrawerResizeHandle onResize={handleResize} width={drawerWidth} minWidth={MIN_WIDTH} maxWidth={MAX_WIDTH} />
        )}

        {mode === 'edit' ? (
          editLoadError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-slate-600">Failed to load this program for editing.</p>
              <Button variant="outline" size="sm" onClick={() => changeMode('view')}>
                Back to overview
              </Button>
            </div>
          ) : editLoading || !editData ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <NewProgramForm
              embedded
              editMode
              initialData={editData}
              onNavigateToRegistry={() => changeMode('view')}
              onSaved={() => {
                changeMode('view')
                setDetailRefreshKey((k) => k + 1)
                onPublishChanged?.()
              }}
              onNavigate={onNavigate}
              canNavigatePrev={canNavigatePrev}
              canNavigateNext={canNavigateNext}
            />
          )
        ) : (
        <>
        <ProgramOverviewHeader
          program={program}
          onClose={onClose}
          onResetWidth={isDesktop ? resetWidth : undefined}
          onRequestDelete={onAddProject ? () => setIsDeleteConfirmOpen(true) : undefined}
          onNavigate={onNavigate}
          canNavigatePrev={canNavigatePrev}
          canNavigateNext={canNavigateNext}
        />

        <DrawerTabs
          idPrefix="program-overview"
          tabs={programTabs}
          value={activeTab}
          onChange={setActiveTab}
        />

        <ScrollArea className="flex-1 bg-slate-50">
          <div className="space-y-4 p-5">
            <DrawerTabPanel idPrefix="program-overview" value="details" active={activeTab === "details"}>
              <div className="space-y-4">
                <ProgramMetadataGrid program={program} detail={detail} />
                <DescriptionAndMFO program={program} detail={detail} />
                <FinishLinesSection program={program} detail={detail} />
                <ThematicTagsSection detail={detail} />
                <MultiFinishWarning program={program} />
                <SubItemsSummary
                  key={`${program.id}-${program.children?.map((item) => item.id).join("|") ?? "none"}`}
                  program={program}
                  programId={program.id}
                  // Reordering rewrites AIP codes, so it follows the same rule
                  // as every other edit: only while the program is editable.
                  canReorder={
                    !!canWrite &&
                    isEditableProgramStatus(
                      rawProgramStatus ??
                        ((program.status_label ?? program.status) || '').toString(),
                    )
                  }
                  onAddActivity={(projectId) => {
                    onAddActivityForProject?.(projectId, program.id)
                  }}
                  onOpen={onOpenSubItem}
                />
                <BudgetSummarySection program={program} />
                {((detail?.remarks ?? (program as ProgramOverviewEntry).remarks)) && (
                  <RemarksSection program={program} detail={detail} />
                )}
                {/* Endorsement and LFC approval are workflow state on the
                    program itself, so they belong beside the details rather
                    than in the comment thread. */}
                {loadEndorsements && (
                  <EndorsementPanel
                    programId={program.id}
                    loadEndorsements={loadEndorsements}
                    refreshKey={activityRefreshKey}
                  />
                )}
                {loadApprovals && (
                  <LfcCommitteePanel
                    programId={program.id}
                    loadApprovals={loadApprovals}
                    refreshKey={activityRefreshKey}
                    currentUserOfficeId={currentUserOfficeId}
                    rawProgramStatus={rawProgramStatus}
                    decideApproval={decideApproval}
                    onDecided={onApprovalDecided}
                  />
                )}
              </div>
            </DrawerTabPanel>

            <DrawerTabPanel idPrefix="program-overview" value="comments" active={activeTab === "comments"}>
              <ActivitySection
                programId={program.id}
                currentUserId={currentUserId}
                loadActivityStream={loadActivityStream}
                postComment={postComment}
                loadCommentPermission={loadCommentPermission}
                deleteComment={deleteComment}
                resolveComment={resolveComment}
                activityRefreshKey={activityRefreshKey}
                onUnresolvedCountChange={setUnresolvedCount}
              />
            </DrawerTabPanel>

            {loadPublicFeedback && (
              <DrawerTabPanel idPrefix="program-overview" value="feedback" active={activeTab === "feedback"}>
                <PublicFeedbackPanel
                  programId={program.id}
                  loadPublicFeedback={loadPublicFeedback}
                  refreshKey={activityRefreshKey}
                />
              </DrawerTabPanel>
            )}

            {canAudit && (
              <DrawerTabPanel idPrefix="program-overview" value="history" active={activeTab === "history"}>
                <EditHistoryTab
                  programId={program.id}
                  refreshKey={activityRefreshKey}
                />
              </DrawerTabPanel>
            )}
            <div className="h-10" />
          </div>
        </ScrollArea>

        <ProgramOverviewFooter
          program={program}
          onAddProject={onAddProject}
          onAddActivity={onAddActivity}
          onSubmit={onSubmit}
          onHeadReview={onHeadReview}
          rawProgramStatus={rawProgramStatus}
          isSubmitting={isSubmitting}
          unresolvedCount={unresolvedCount}
          onRequestDelete={onAddProject ? () => setIsDeleteConfirmOpen(true) : undefined}
          showCompare={
            !!loadActivityStream &&
            (rawProgramStatus === 'PENDING_APPROVAL' ||
              rawProgramStatus === 'PUBLISHED_REVISION')
          }
          canPublish={canPublish}
          canWrite={canWrite}
          isSuperAdmin={isSuperAdmin}
          publishedVersion={detail?.currentVersion ?? null}
          onPublishChanged={onPublishChanged}
          onEdit={() => changeMode('edit')}
          compact={isDesktop && drawerWidth < COMPACT_ACTIONS_WIDTH}
        />
        </>
        )}

        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Program?</DialogTitle>
              <DialogDescription>
                            This will permanently delete {program?.program_name || program?.ppa_description} and all its projects and activities.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm text-slate-600">Are you sure you want to delete this program? This action cannot be undone.</p>
            </div>
            <DialogFooter>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting}>Cancel</Button>
                <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting} onClick={handleDeleteProgram}>
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute bottom-16 right-4 z-30 rounded-md border border-neutral-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-neutral-700 shadow-sm transition-all duration-150",
            showResetToast ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          )}
        >
          Drawer width reset
        </div>

      </SheetContent>
    </Sheet>
  )
}
