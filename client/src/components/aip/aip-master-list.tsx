"use client"

import { memo, useMemo, useEffect, useRef, type MouseEvent, useState } from "react"
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronRight, FileSpreadsheet, FolderOpen, Eye, MessageSquare, Plus, type LucideIcon } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableFooter,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getProgramStatusSolidClass } from "@/lib/program-status"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getFinishLineLabel, getFinishLineTheme } from "@/lib/finish-lines"
import { useAIPExpand } from "@/hooks/useAIPExpand"
import { SimpleSelect } from "@/components/custom/simple-select"
import { PAGE_SIZE_OPTIONS } from "@/lib/filter-cookie"
import { papClassLabel, type PapClass } from "@/lib/schemas"
import { SpecialFundBadges } from "@/components/public/special-fund-badges"
import type { SourceLink } from "@/lib/api"
import { sourceLabel } from "@/lib/source-label"
import {
  expandableKeysIn,
  groupByOffice,
  officeGroupKey,
  officeKeysMatching,
  type OfficeGroup,
} from "@/lib/aip-grouping"
import { collapseMirroredChildren } from "@/lib/aip-mirrored-child"
import { cn } from "@/lib/utils"
import { formatMillions } from "@/lib/currency-formatter"
import { GOALS } from '@/lib/goal-label';

/**
 * AIP Entry data structure
 */
export type AIPEntry = {
  id: string
  program_name?: string
  ppa_description?: string
  program_code: string
  ppa_type: "Program" | "Project" | "Activity"
  status: "Draft" | "Submitted" | "Approved" | "Rejected"
  /** Humanized raw ProgramStatus for display (e.g. "Head Reviewed", "Endorsed"). */
  status_label?: "Draft" | "For Revision" | "Submitted" | "Head Reviewed" | "Pending Endorsement" | "Endorsed" | "Pending Approval" | "For Review" | "Under Review" | "Approved" | "Rejected" | "Published" | "Revision" | "Archived"
  primary_finish_line_id?: string
  secondary_finish_line_id?: string
  /** Drives the section divider rows. Null/absent counts as Operations. */
  papClass?: PapClass | null
  /**
   * Why a bulk-imported program still needs a human look. Non-empty blocks
   * publishing (`INCOMPLETE_IMPORT`) and shows a warning marker on the row.
   * Always empty on anything authored in the portal.
   */
  importWarnings?: string[]
  /** Set while ARCHIVED (specs/013): why it was superseded. */
  archivedReason?: string | null
  /**
   * Gaps in the row's own data, derived server-side on every read. Block
   * nothing by themselves — they clear when the field is filled in — but they
   * share the row marker with `importWarnings`.
   */
  dataWarnings?: string[]
  /** The city file and row this was imported from. Null when authored in the portal. */
  source?: SourceLink | null
  /** Funds the row is charged to; the special ones are badged beside the code (specs/016). */
  specialFunds?: string[]
  finishLineName?: string
  finishLineVisionNumber?: number | null
  subFinishLineId?: string | null
  subFinishLineName?: string | null
  expected_output_mfo?: string | null
  ps_amount: string
  mooe_amount: string
  fe_amount: string
  co_amount: string
  total_amount: string
  /** Sum of root PA proposedBudget for programs; own proposedBudget for PAs. */
  proposedBudget?: string | null
  children?: AIPEntry[]
  parent_id?: string
  lastUpdatedAt?: string | null
  // Additional metadata for drawer/metadata display
  office_id?: string | null
  office_name?: string | null
  /** Short form, e.g. "CEO". What the office grouping labels headers with. */
  office_acronym?: string | null
  /** Set on component programs — the office whose AB sheet this prints under. */
  host_office_id?: string | null
  host_office_name?: string | null
  host_office_acronym?: string | null
  department_id?: string
  departmentId?: string
  created_date?: string
  updated_date?: string
  implementationStartMonth?: number | null
  implementationStartYear?: number | null
  implementationEndMonth?: number | null
  implementationEndYear?: number | null
  supportingOffices?: Array<{ id: string; name: string; acronym?: string }>
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN'
  /** Owning program, on PA rows only — `parent_id` is the parent *PA*. */
  programId?: string
  feedbackCount?: number
  /** Effective tags: own direct applications, plus a PA's parent's it doesn't
   * already carry (`inherited: true`). Always `inherited: false` on a Program row. */
  thematicTags?: { id: string; name: string; inherited: boolean }[]
}

/**
 * Props for AIPMasterList component
 */
interface AIPMasterListProps {
  data: AIPEntry[]
  searchTerm?: string
  /** True when any filter (cluster, office, finish line, or search) is active — changes empty-state copy. */
  hasActiveFilters?: boolean
  /** Override the empty-state message (takes precedence over hasActiveFilters copy). */
  emptyStateMessage?: string
  onViewProgram?: (id: string) => void
  onViewProject?: (id: string) => void
  onViewActivity?: (id: string) => void
  onAddProject?: (programId: string) => void
  onAddActivity?: (projectId: string, programId?: string) => void
  showBreakdown?: boolean
  /** Hide the Status column (public view). */
  showStatus?: boolean
  /** Show Last Updated on program rows only (public view). */
  showLastUpdated?: boolean
  /** Hide the PPA type badge (Program / Project / Activity) on each row. */
  showTypeBadge?: boolean
  /**
   * Group top-level programs under GAS / STO / Operations divider rows, matching
   * how the cluster export prints them. Off by default: it only reads right when
   * the caller's data is ordered by `papClass` server-side (the registry is),
   * otherwise the same heading repeats down the page.
   */
  showPapClassSections?: boolean
  /**
   * Lay the list out the way the printed AIP does: a collapsible header per
   * implementing office, with the three appropriation sections inside it.
   *
   * Supersedes `showPapClassSections`, which sections globally — every office's
   * GAS, then every office's STO — an order the city does not read the AIP in.
   * Also removes the per-row office column, since the header carries it, and
   * makes an office the unit of disclosure so a program's subtree is never split.
   */
  groupByOffice?: boolean
  /**
   * Keep the Implementing Office column while grouped, filled only on
   * component programs — the rows whose band header names their host
   * office rather than the office that owns them.
   */
  showOfficeOnComponents?: boolean
  /** Show a Feedback column with the resident comment count (public view). */
  showFeedbackCount?: boolean
  /** Hide the Total column (public view shows only Proposed). */
  showTotal?: boolean
  /** Hide the Proposed column (staff registry shows only Total — they're equal
   *  while line-item entry is deferred, so both would be the same number). */
  showProposed?: boolean
  /** The Proposed column's label. The public site passes "Estimated Cost" or "Appropriation" (`AMOUNT_LABEL`). */
  proposedLabel?: string
  /** Hide the in-table Grand Total footer row and merge it into the pagination bar instead. */
  showTableFooter?: boolean
  /** Program ids with activity newer than the user last saw — renders an unread dot. */
  unreadIds?: Set<string>
  /** Program ids that just changed via a live event — briefly highlighted. */
  recentlyChangedIds?: Set<string>
  /** One program to point out (the one a link named). Scrolled to once. */
  highlightedId?: string | null
  /** Expand whatever office/program/project rows hide this id, so it renders even if its branch is collapsed. */
  ensureVisibleId?: string | null
  /** Number of finish lines loaded from the API, used to distribute tag colors. */
  totalFinishLineCount?: number
  page?: number
  totalPages?: number
  totalItems?: number
  aggregateTotals?: { ps: string; mooe: string; fe?: string; co: string; total: string }
  /** Base the page-mode grand total on each entry's proposedBudget instead of the
   *  line-item rollup (total_amount). Used by the public view, where programs are
   *  shown at the proposed-budget stage and rollups are 0. */
  useProposedTotals?: boolean
  onPageChange?: (page: number) => void
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  /** Program IDs in an editable status (see EDITABLE_PROGRAM_STATUSES) — only these show "+" buttons. Omit to show for all. */
  editableProgramIds?: Set<string>
  /** Disable the auto-expand of the first program row on data load. Default false. */
  disableAutoExpand?: boolean
  /** Fired when an office band is opened (grouped mode) — lets a caller load rows lazily. */
  onExpandOffice?: () => void
  /**
   * Reports the "N programs across M offices" summary (grouped mode only) so a
   * caller can render it beside the Office/Thematic Tags filters instead of in
   * its own row here — saves a whole strip of vertical space above the table.
   */
  onSummaryChange?: (summary: { totalItems: number; officeCount: number } | null) => void
  /**
   * Adds a Reorder button to each grouped appropriation section (not the
   * component-programs band, whose rows belong to other offices' scopes).
   */
  onReorderSection?: (section: {
    officeId: string
    officeLabel: string
    papClass: PapClass
    label: string
  }) => void
}

/**
 * Flattened row for display with depth information
 */
interface DisplayRow {
  entry: AIPEntry
  depth: number
  hasChildren: boolean
  /**
   * When set, the row renders as a full-width divider rather than an entry, and
   * `entry` is only the program that opens it (used for the React key).
   *
   * `office` dividers are collapsible and carry a program count and a total;
   * `section` dividers are the AIP form's three appropriation headings and are
   * plain labels.
   */
  divider?: {
    kind: 'office' | 'section'
    /** Stable key: the office id for office rows, the papClass for sections. */
    key: string
    label: string
    /** Office rows only: the full name, shown beside the acronym label. */
    sublabel?: string
    /** Office rows only. */
    programCount?: number
    total?: string
    expanded?: boolean
    /** Office rows only: every id the header's toggle opens or closes. */
    expandKeys?: string[]
    /** Grouped section rows only — what a reorder of this section targets. */
    officeId?: string | null
    officeLabel?: string
    papClass?: PapClass | null
  }
}


/**
 * Marks a program that still needs an office's attention, and says why in a
 * tooltip.
 *
 * The publish panel already lists both kinds of reason — but only once you have
 * opened the program. On a 241-row registry that is too late to be useful, so
 * the marker belongs on the row.
 *
 * Two different things share one triangle, and the tooltip is what keeps them
 * apart:
 *
 * - **Import decisions** (`importWarnings`) — what the workbook import chose on
 *   the program's behalf. Blocks publishing (`INCOMPLETE_IMPORT`) and clears
 *   only via *Mark import reviewed*, because nothing in the data can re-check
 *   an inferred finish line.
 * - **Data gaps** (`dataWarnings`) — derived server-side on every read. Block
 *   nothing by themselves and clear the moment the field is filled in.
 *
 * Gaps used to be deliberately kept off the row, on the grounds that they would
 * mark half the registry. Measured against live data that fear turned out to
 * land on one cycle only: AB 2026 is already fully marked by import decisions,
 * so it does not move at all, and 2027 goes from 94 marked rows to 155. Seeing
 * which of 241 entries are incomplete is worth that.
 *
 * The cost of merging them: clicking *Mark import reviewed* will not always
 * make the triangle go away. That is correct — the gaps are still there — and
 * the tooltip's two headings are what explain it.
 */
function ImportWarningMarker({
  importWarnings,
  dataWarnings,
}: Readonly<{ importWarnings: string[]; dataWarnings: string[] }>) {
  if (importWarnings.length === 0 && dataWarnings.length === 0) return null

  const label = [
    importWarnings.length
      ? `Import decisions to confirm: ${importWarnings.join(' ')}`
      : '',
    dataWarnings.length ? `Data gaps: ${dataWarnings.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tooltip>
      <TooltipTrigger className="shrink-0">
        <AlertTriangle className="size-4 text-amber-600" aria-label={label} />
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal">
        <p className="mb-1 font-medium">Needs attention</p>
        {importWarnings.length > 0 && (
          <>
            <p className="text-xs font-medium opacity-80">
              Import decisions to confirm
            </p>
            <ul className="mb-1 ml-3 list-disc space-y-0.5">
              {importWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </>
        )}
        {dataWarnings.length > 0 && (
          <>
            <p className="text-xs font-medium opacity-80">Data gaps</p>
            <ul className="ml-3 list-disc space-y-0.5">
              {dataWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}


/** "Open in sheet": the workbook row an imported line came from. */
function SourceRowLink({ source }: Readonly<{ source?: SourceLink | null }>) {
  if (!source) return null
  const [sheet, row] = source.ref.split("!r")
  if (!source.url) return <span className="text-tbl-muted">{sourceLabel(source)}</span>
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={`Open ${sheet} row ${row} in ${source.file}`}
      className="inline-flex shrink-0 items-center gap-1 text-tbl-muted underline-offset-2 hover:text-tbl-accent-ink hover:underline"
    >
      <FileSpreadsheet className="size-3.5" aria-hidden />
      {sheet} r{row}
    </a>
  )
}

/**
 * A footer figure with its column name above it.
 *
 * The grand total sits at the foot of a list that can run thousands of rows, so
 * the header naming these columns is long off-screen by the time anyone reads
 * them. Repeating the column name here is cheaper than making the header sticky,
 * which the surrounding `overflow-hidden` containers would fight.
 */
function FooterFigure({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <>
      <span className="block text-[9px] font-medium uppercase tracking-wider text-tbl-faint">
        {label}
      </span>
      {children}
    </>
  )
}

/**
 * The contents of an office divider — shared by the desktop table and the mobile
 * card list so the two cannot drift. Only the wrapper element differs.
 */
function OfficeDividerContent({
  label,
  sublabel,
  programCount,
  total,
  expanded,
}: Readonly<{
  label: string
  sublabel?: string
  programCount?: number
  total?: string
  expanded?: boolean
}>) {
  return (
    <div className="flex w-full items-center gap-2">
      <ChevronRight
        aria-hidden
        className={cn(
          'size-4 shrink-0 text-tbl-muted-2 transition-transform',
          expanded && 'rotate-90'
        )}
      />
      {/* The header row spans the table, so there is room for both: the acronym
          carries the identity, the full name is there for anyone who needs it. */}
      <span className="min-w-0 flex-1 truncate text-left text-sm">
        <span className="font-semibold text-tbl-ink">{label}</span>
        {sublabel && (
          <span className="ml-2 font-normal text-tbl-muted-2">{sublabel}</span>
        )}
      </span>
      {programCount !== undefined && (
        <span className="shrink-0 text-xs font-normal text-tbl-muted-2">
          {programCount} {programCount === 1 ? 'program' : 'programs'}
        </span>
      )}
      {total !== undefined && (
        <span className="flex shrink-0 items-baseline gap-1.5">
          {/* Labelled for the same reason the footer figures are: an office 40
              rows down the page has the column header long off-screen, and a
              bare number in that position reads as anything. */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-tbl-faint">
            Total
          </span>
          {/* Same helper and the same 3dp millions the amount columns use, so a
              header reads as the sum of the rows under it rather than a
              differently-rounded number. */}
          <span className="tabular-nums text-sm font-semibold text-tbl-ink">
            {formatMillions(Number(total))}
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * Helper: Get row type badge styling
 */
function getTypeBadgeClass(ppaType: AIPEntry["ppa_type"]): string {
  switch (ppaType) {
    case "Program":
      return "bg-tbl-accent-fill text-tbl-accent-ink border-tbl-accent-rule"
    case "Project":
      return "bg-green-50 text-green-700 border-green-200"
    case "Activity":
      return "bg-orange-50 text-orange-700 border-orange-200"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const delta = 2
  const left = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)
  const pages: (number | '...')[] = [1]
  if (left > 2) pages.push('...')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('...')
  pages.push(total)
  return pages
}

function formatExact(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Helper: Flatten hierarchical data with depth tracking
 */
function flattenData(
  data: AIPEntry[],
  expandedIds: Set<string>,
  depth: number = 0,
  /** Insert a PAP-class divider whenever the section changes (top level only). */
  withSections: boolean = false
): DisplayRow[] {
  const rows: DisplayRow[] = []
  let currentSection: PapClass | null = null

  for (const entry of data) {
    const hasChildren = (entry.children && entry.children.length > 0) ?? false

    if (withSections && depth === 0) {
      // Legacy rows carry no papClass and export under Operations, so they join
      // that section here rather than getting a fourth "unclassified" heading.
      const section: PapClass = entry.papClass ?? 'OPERATIONS'
      if (section !== currentSection) {
        rows.push({
          entry,
          depth,
          hasChildren: false,
          divider: {
            kind: 'section',
            key: section,
            label: papClassLabel(section) ?? section,
          },
        })
        currentSection = section
      }
    }

    rows.push({
      entry,
      depth,
      hasChildren,
    })

    // Add children if expanded
    if (hasChildren && expandedIds.has(entry.id)) {
      const childRows = flattenData(entry.children!, expandedIds, depth + 1)
      rows.push(...childRows)
    }
  }

  return rows
}

/**
 * The registry laid out the way the city reads its AIP: office, then the three
 * appropriation sections inside it, then the program tree.
 *
 * Offices are collapsed until asked for. With 53 offices and ~2,100 rows in a
 * full cycle, the default view is 53 rows — and because the unit of disclosure is
 * a whole office, no page boundary can cut a program's subtree in half, which is
 * what row pagination used to do.
 *
 * An office's own row is skipped when collapsed, so its sections and programs
 * cost nothing until expanded.
 */
function flattenGroupedData(
  groups: OfficeGroup<AIPEntry>[],
  expandedIds: Set<string>
): DisplayRow[] {
  const rows: DisplayRow[] = []

  for (const group of groups) {
    const key = officeGroupKey(group.officeId)
    // Every group has at least one program, so `sections[0].programs[0]` is safe
    // and gives the divider row a stable React key.
    const opener = group.sections[0]?.programs[0]
    if (!opener) continue

    const expanded = expandedIds.has(key)

    rows.push({
      entry: opener,
      depth: 0,
      hasChildren: false,
      divider: {
        kind: 'office',
        key,
        label: group.officeAcronym,
        sublabel:
          group.officeName === group.officeAcronym ? undefined : group.officeName,
        programCount: group.programCount,
        total: group.total,
        expanded,
        expandKeys: expandableKeysIn(group),
      },
    })

    if (!expanded) continue

    for (const section of group.sections) {
      rows.push({
        entry: section.programs[0],
        depth: 0,
        hasChildren: false,
        divider: {
          kind: 'section',
          // `papClass` is null on the COMPONENT PROGRAMS band, which is not one
          // of the three appropriation sections. Naming it keeps the key stable
          // and distinct rather than letting two bands share `…:null`.
          key: `${key}:${section.papClass ?? 'COMPONENT'}`,
          label: section.label,
          officeId: group.officeId,
          officeLabel: group.officeAcronym,
          papClass: section.papClass,
        },
      })
      rows.push(...flattenData(section.programs, expandedIds, 0, false))
    }
  }

  return rows
}

/**
 * Helper: Search recursively through data
 */
function searchRecursive(
  entry: AIPEntry,
  term: string
): boolean {
  const lowerTerm = term.toLowerCase()
  const nameMatch = entry.program_name
    ?.toLowerCase()
    .includes(lowerTerm) ?? false
  const descriptionMatch = entry.ppa_description
    ?.toLowerCase()
    .includes(lowerTerm) ?? false
  const codeMatch = entry.program_code.toLowerCase().includes(lowerTerm)

  return nameMatch || descriptionMatch || codeMatch
}

/**
 * Helper: Filter data recursively based on search term
 */
function filterDataRecursive(
  data: AIPEntry[],
  searchTerm: string
): AIPEntry[] {
  if (!searchTerm.trim()) {
    return data
  }

  return data.flatMap((entry) => {
    const matchesSelf = searchRecursive(entry, searchTerm)
    const filteredChildren = entry.children
      ? filterDataRecursive(entry.children, searchTerm)
      : []

    if (!matchesSelf && filteredChildren.length === 0) {
      return []
    }

    return [
      {
        ...entry,
        children: matchesSelf ? entry.children : filteredChildren,
      },
    ]
  })
}

/**
 * Helper: Collect all leaf entries for footer totals
 */
function collectLeafEntries(entries: AIPEntry[]): AIPEntry[] {
  return entries.flatMap((entry) => {
    if (entry.children && entry.children.length > 0) {
      return collectLeafEntries(entry.children)
    }

    return [entry]
  })
}

/**
 * Compute PS/MOOE/FE/CO/total to display for a row given the current expand state.
 * - Leaf node: own amounts.
 * - Collapsed with children: aggregate of all leaf descendants.
 * - Expanded with children: zeros (renders as " - "), children show their own.
 */
function getEffectiveAmounts(
  entry: AIPEntry,
  expandedIds: Set<string>
): { ps: number; mooe: number; fe: number; co: number; total: number } {
  const hasChildren = !!(entry.children && entry.children.length > 0)

  if (!hasChildren) {
    return {
      ps: parseFloat(entry.ps_amount) || 0,
      mooe: parseFloat(entry.mooe_amount) || 0,
      fe: parseFloat(entry.fe_amount) || 0,
      co: parseFloat(entry.co_amount) || 0,
      total: parseFloat(entry.total_amount) || 0,
    }
  }

  if (expandedIds.has(entry.id)) {
    return { ps: 0, mooe: 0, fe: 0, co: 0, total: 0 }
  }

  // Collapsed parent — sum all leaf descendants
  return collectLeafEntries([entry]).reduce(
    (acc, leaf) => ({
      ps: acc.ps + (parseFloat(leaf.ps_amount) || 0),
      mooe: acc.mooe + (parseFloat(leaf.mooe_amount) || 0),
      fe: acc.fe + (parseFloat(leaf.fe_amount) || 0),
      co: acc.co + (parseFloat(leaf.co_amount) || 0),
      total: acc.total + (parseFloat(leaf.total_amount) || 0),
    }),
    { ps: 0, mooe: 0, fe: 0, co: 0, total: 0 }
  )
}

/**
 * Finish Lines Column Component
 */
function FinishLinesCell({
  entry,
  totalFinishLineCount,
}: {
  entry: AIPEntry
  totalFinishLineCount?: number
}) {
  const primaryLabel = entry.finishLineName ?? getFinishLineLabel(entry.primary_finish_line_id)
  const secondaryLabel = entry.secondary_finish_line_id
    ? getFinishLineLabel(entry.secondary_finish_line_id)
    : null
  const hasSecondary = !!secondaryLabel && secondaryLabel !== "-"
  const theme = getFinishLineTheme(entry.finishLineVisionNumber, totalFinishLineCount)
  const primaryChip =
    entry.finishLineVisionNumber != null
      ? `#${entry.finishLineVisionNumber}`
      : "-"

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={cn(
              "inline-flex h-6 min-w-[2.25rem] justify-center rounded-full px-2 text-[11px] font-semibold",
              theme.chip
            )}
          >
            {primaryChip}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-normal">{primaryLabel}</TooltipContent>
      </Tooltip>
      {hasSecondary && (
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="outline"
              className="inline-flex h-6 min-w-[2.25rem] justify-center rounded-full px-2 text-[11px] font-semibold border-tbl-rule-strong bg-tbl-fill-strong text-tbl-muted"
            >
              {secondaryLabel}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-normal">{secondaryLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * "New activity since you last viewed" marker: a stripe on the row's left edge
 * rather than a dot beside the title, which pushed the first line of a wrapped
 * title out of line with the rest and left the name column ragged.
 */
const UNREAD_STRIPE =
  'relative before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-tbl-accent before:content-[""]'

const UNREAD_LABEL = 'New activity since you last viewed this program'

/**
 * "This row is open in the drawer" marker. The fill tint alone reads as
 * muted next to the unread stripe and type-tint backgrounds already on the
 * row, so this adds a real outline on top of the inset ring — two lines
 * rather than one — to make the open row unmistakable at a glance.
 */
const HIGHLIGHT_RING =
  'bg-tbl-accent-fill ring-2 ring-inset ring-tbl-accent outline outline-2 -outline-offset-4 outline-tbl-accent'

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-medium rounded-full px-2 py-0.5",
        getProgramStatusSolidClass(status)
      )}
    >
      {status}
    </Badge>
  )
}

/**
 * Budget Cell Component
 */
function BudgetCell({ amount }: { amount: number }) {
  const display = <div className="truncate text-right text-sm tabular-nums">{formatMillions(amount)}</div>
  if (!amount) return display
  return (
    <Tooltip>
      <TooltipTrigger className="w-full">{display}</TooltipTrigger>
      <TooltipContent>{formatExact(amount)}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Total Amount Cell Component
 */
function TotalAmountCell({ total }: { total: number }) {
  const display = (
    <div className="flex items-center justify-end gap-2 text-right text-sm font-medium tabular-nums">
      <span className="truncate">{formatMillions(total)}</span>
    </div>
  )
  if (!total) return display
  return (
    <Tooltip>
      <TooltipTrigger className="w-full">{display}</TooltipTrigger>
      <TooltipContent>{formatExact(total)}</TooltipContent>
    </Tooltip>
  )
}

function ActionIconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: LucideIcon
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        <Icon className="size-4" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

interface AIPCardListProps {
  displayRows: DisplayRow[]
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  setManyExpanded: (ids: string[], expanded: boolean) => void
  /** Resolves the office to print on a card, or null to omit it. */
  officeCellFor: (entry: AIPEntry) => string | null
  showBreakdown: boolean
  showProposed: boolean
  proposedLabel: string
  showStatus: boolean
  showLastUpdated: boolean
  showTypeBadge: boolean
  showFeedbackCount?: boolean
  onViewProgram?: (id: string) => void
  onViewProject?: (id: string) => void
  onViewActivity?: (id: string) => void
  onAddProject?: (programId: string) => void
  onAddActivity?: (projectId: string, programId?: string) => void
  totalFinishLineCount?: number
  unreadIds?: Set<string>
  recentlyChangedIds?: Set<string>
  highlightedId?: string | null
  grandTotals: { ps: number; mooe: number; fe: number; co: number; total: number }
  editableProgramIds?: Set<string>
  onExpandOffice?: () => void
}

const AIPCardList = memo(function AIPCardList({
  displayRows,
  expandedIds,
  toggleExpand,
  showBreakdown,
  showProposed,
  proposedLabel,
  showStatus,
  showLastUpdated,
  showTypeBadge,
  showFeedbackCount = false,
  onViewProgram,
  onViewProject,
  onViewActivity,
  onAddProject,
  onAddActivity,
  totalFinishLineCount,
  unreadIds,
  recentlyChangedIds,
  highlightedId,
  grandTotals,
  editableProgramIds,
  officeCellFor,
  setManyExpanded,
  onExpandOffice,
}: AIPCardListProps) {
  return (
    <div role="list" aria-label="AIP programs, projects, and activities">
      {displayRows.map((row) => {
        if (row.divider) {
          const { kind, key, label, sublabel, programCount, total, expanded } =
            row.divider
          if (kind === 'office') {
            return (
              <button
                key={`office-${key}`}
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  if (!expanded) onExpandOffice?.()
                  setManyExpanded(row.divider!.expandKeys ?? [key], !expanded)
                }}
                className="flex w-full items-center border-y border-tbl-rule-strong bg-tbl-band-office px-4 py-2.5 text-left hover:bg-tbl-band-office-hover"
              >
                <OfficeDividerContent
                  label={label}
                  sublabel={sublabel}
                  programCount={programCount}
                  total={total}
                  expanded={expanded}
                />
              </button>
            )
          }
          return (
            <div
              key={`section-${key}`}
              className="border-y border-tbl-rule bg-tbl-band-section px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-tbl-muted"
            >
              {label}
            </div>
          )
        }
        const { entry, depth, hasChildren } = row
        const isExpand = expandedIds.has(entry.id)
        const amounts = getEffectiveAmounts(entry, expandedIds)
        const isProgram = entry.ppa_type === "Program"
        const isProject = entry.ppa_type === "Project"
        const isLeaf = !hasChildren
        const title = entry.program_name || entry.ppa_description || "Unnamed"
        const typeBadgeClass = getTypeBadgeClass(entry.ppa_type)
        const isUnread = isProgram && !!unreadIds?.has(entry.id)
        const justChanged = isProgram && !!recentlyChangedIds?.has(entry.id)
        const highlighted = !!highlightedId && entry.id === highlightedId

        const canViewEntry =
          (entry.ppa_type === "Program" && !!onViewProgram) ||
          (entry.ppa_type === "Project" && !!onViewProject) ||
          (entry.ppa_type === "Activity" && !!onViewActivity)

        const viewEntry = () => {
          if (entry.ppa_type === "Program") onViewProgram?.(entry.id)
          if (entry.ppa_type === "Project") onViewProject?.(entry.id)
          if (entry.ppa_type === "Activity") onViewActivity?.(entry.id)
        }

        return (
          <div
            key={entry.id}
            role="listitem"
            style={{ paddingLeft: `${depth * 16 + 16}px` }}
            className={cn(
              "group border-t border-tbl-rule pr-4 py-3.5 transition-colors",
              // Programs distinguished by background tint only — no side-stripe (absolute ban).
              // The unread stripe below marks *new activity*, not the row's type.
              isProgram ? "bg-tbl-row-program" : isProject ? "bg-tbl-row-project" : "bg-tbl-row-activity",
              isUnread && UNREAD_STRIPE,
              justChanged && "animate-pulse bg-amber-50",
              highlighted && HIGHLIGHT_RING
            )}
            data-highlighted-row={highlighted || undefined}
          >
            {/* Title row — min-height 44px ensures the row is tappable even without explicit buttons */}
            <div className="flex min-h-[44px] items-start gap-2">
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex min-w-0 items-start gap-1.5">
                  {isUnread && <span className="sr-only">{UNREAD_LABEL}</span>}
                  {isProgram && (
                    <ImportWarningMarker
                      importWarnings={entry.importWarnings ?? []}
                      dataWarnings={entry.dataWarnings ?? []}
                    />
                  )}
                  {canViewEntry ? (
                    <button
                      type="button"
                      aria-label={`View ${entry.ppa_type.toLowerCase()}: ${title}`}
                      onClick={viewEntry}
                      className={cn(
                        "line-clamp-3 min-w-0 flex-1 text-left text-sm leading-snug text-tbl-accent-ink-2 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tbl-accent focus-visible:ring-offset-1",
                        isProgram ? "font-semibold" : "font-medium"
                      )}
                      title={title}
                    >
                      {title}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "line-clamp-3 min-w-0 flex-1 text-sm leading-snug",
                        isProgram ? "font-semibold text-tbl-ink" : "font-medium text-tbl-ink-2"
                      )}
                      title={title}
                    >
                      {title}
                    </span>
                  )}
                  {showTypeBadge && entry.ppa_type !== 'Program' && (
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
                        typeBadgeClass
                      )}
                    >
                      {entry.ppa_type}
                    </span>
                  )}
                </div>
                {/* program_code: text-tbl-muted = ~5.9:1 on white. Sufficient for AA; for AAA
                    use text-tbl-ink-3 (~9.6:1). Code strings are secondary metadata. */}
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-tbl-ink-3">
                  {entry.program_code}
                  <SpecialFundBadges funds={entry.specialFunds} />
                  <SourceRowLink source={entry.source} />
                </p>
              </div>

              {/* Expand/collapse: 44×44px touch target for WCAG AAA 2.5.5 */}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  aria-expanded={isExpand}
                  aria-label={isExpand ? `Collapse ${entry.ppa_type.toLowerCase()}` : `Expand ${entry.ppa_type.toLowerCase()}`}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md transition-colors hover:bg-tbl-fill-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tbl-accent"
                >
                  {isExpand ? (
                    <ChevronDown className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </div>

            {/* Meta row: finish line + status */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <FinishLinesCell entry={entry} totalFinishLineCount={totalFinishLineCount} />
              {showStatus && <StatusBadge status={entry.status_label ?? entry.status} />}
              {showLastUpdated && isProgram && entry.lastUpdatedAt && (
                <span className="text-xs text-tbl-faint">
                  Updated {formatRelativeDate(entry.lastUpdatedAt)}
                </span>
              )}
              {showFeedbackCount && isProgram && (entry.feedbackCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-tbl-muted-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {entry.feedbackCount}
                </span>
              )}
            </div>

            {/* Implementing office: text-tbl-ink-3 = ~9.6:1 on white, passes AAA */}
            {isProgram && officeCellFor(entry)?.trim() && (
              <p className="mt-1.5 text-xs leading-relaxed text-tbl-ink-3">
                {officeCellFor(entry)}
              </p>
            )}

            {/* Separator */}
            <div className="mt-3 border-t border-tbl-rule-soft" aria-hidden="true" />

            {/* Budget + Actions */}
            {(() => {
              const isExpandedParent = hasChildren && isExpand
              const proposed = showProposed && !isExpandedParent && entry.proposedBudget
                ? parseFloat(entry.proposedBudget) || 0
                : null
              return (
                <div className="mt-2.5 flex items-end justify-between gap-2">
                  {/* Left: amounts */}
                  <div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      <div>
                        {/* text-xs (12px) replaces text-[10px]; text-tbl-muted passes AA on white */}
                        <p className="text-xs font-medium text-tbl-muted">Total</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-tbl-ink">
                          {formatMillions(amounts.total, { includeCurrency: true })}
                        </p>
                      </div>
                      {proposed !== null && (
                        <div>
                          <p className="text-xs font-medium text-tbl-muted-2">{proposedLabel}</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-tbl-ink-3">
                            {formatMillions(proposed, { includeCurrency: true })}
                          </p>
                        </div>
                      )}
                    </div>
                    {showBreakdown && isLeaf && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-tbl-muted">
                        <span>PS {formatMillions(amounts.ps)}</span>
                        <span>MOOE {formatMillions(amounts.mooe)}</span>
                        {amounts.fe ? <span>FE {formatMillions(amounts.fe)}</span> : null}
                        <span>CO {formatMillions(amounts.co)}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: action buttons — hidden until the row is hovered/focused */}
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                    {isProgram && (
                      <>
                        <ActionIconButton
                          label="View program"
                          icon={Eye}
                          onClick={(e) => { e.stopPropagation(); onViewProgram?.(entry.id) }}
                        />
                        {onAddProject && (!editableProgramIds || editableProgramIds.has(entry.id)) && (
                          <ActionIconButton
                            label="Add project"
                            icon={Plus}
                            onClick={(e) => { e.stopPropagation(); onAddProject(entry.id) }}
                          />
                        )}
                      </>
                    )}
                    {isProject && (
                      <>
                        <ActionIconButton
                          label="View project"
                          icon={Eye}
                          onClick={(e) => { e.stopPropagation(); onViewProject?.(entry.id) }}
                        />
                        {/* Gate on the owning program, not `parent_id`: that is the
                            parent *PA* and is undefined for a root project, so the
                            button was hidden for every top-level project. */}
                        {entry.costMode === "ACTIVITY_CHILDREN" && onAddActivity && (!editableProgramIds || editableProgramIds.has(entry.programId ?? '')) && (
                          <ActionIconButton
                            label="Add activity"
                            icon={Plus}
                            onClick={(e) => { e.stopPropagation(); onAddActivity(entry.id, entry.programId) }}
                          />
                        )}
                      </>
                    )}
                    {entry.ppa_type === "Activity" && (
                      <ActionIconButton
                        label="View activity"
                        icon={Eye}
                        onClick={(e) => { e.stopPropagation(); onViewActivity?.(entry.id) }}
                      />
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })}

      {/* Grand total footer */}
      <div className="border-t-2 border-tbl-rule bg-tbl-fill px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-tbl-ink">Grand Total</p>
            {/* "Projects & Activities only" until a collapsed mirror made a
                program a leaf too. The figure has always been the sum of the
                leaves — that is what does not double-count a parent. */}
            <p className="text-xs text-tbl-muted">(Sum of all rows)</p>
          </div>
          <p className="text-base font-bold tabular-nums text-primary">
            {formatMillions(grandTotals.total, { includeCurrency: true, autoScale: true })}
          </p>
        </div>
        {showBreakdown && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-tbl-muted">
            <span>PS {formatMillions(grandTotals.ps)}</span>
            <span>MOOE {formatMillions(grandTotals.mooe)}</span>
            <span>FE {formatMillions(grandTotals.fe)}</span>
            <span>CO {formatMillions(grandTotals.co)}</span>
          </div>
        )}
      </div>
    </div>
  )
})

/** True if `id` is the group's own entry or anywhere in its programs/children tree. */
function officeGroupContainsId(group: OfficeGroup<AIPEntry>, id: string): boolean {
  const walk = (rows: AIPEntry[]): boolean =>
    rows.some((row) => row.id === id || (row.children && walk(row.children)))
  return group.sections.some((section) => walk(section.programs))
}

/** Ids of every ancestor (root-first) of `targetId` in an ungrouped tree, or null if not found. */
function findAncestorIds(
  entries: AIPEntry[],
  targetId: string,
  trail: string[] = [],
): string[] | null {
  for (const entry of entries) {
    if (entry.id === targetId) return trail
    if (entry.children) {
      const found = findAncestorIds(entry.children, targetId, [...trail, entry.id])
      if (found) return found
    }
  }
  return null
}

/**
 * AIP Master List Table Component
 *
 * Displays hierarchical AIP data with Figma-aligned styling and layout.
 */
export function AIPMasterList({
  data,
  searchTerm = "",
  hasActiveFilters = false,
  emptyStateMessage,
  onViewProgram,
  onViewProject,
  onViewActivity,
  onAddProject,
  onAddActivity,
  showBreakdown = true,
  showStatus = true,
  showLastUpdated = false,
  showTypeBadge = true,
  showPapClassSections = false,
  groupByOffice: groupOffices = false,
  showOfficeOnComponents = false,
  showFeedbackCount = false,
  showTotal = true,
  showProposed = true,
  proposedLabel = 'Proposed',
  showTableFooter = true,
  unreadIds,
  recentlyChangedIds,
  highlightedId,
  ensureVisibleId,
  totalFinishLineCount,
  page = 1,
  totalPages = 1,
  totalItems = 0,
  aggregateTotals,
  useProposedTotals = false,
  onPageChange,
  pageSize = 10,
  onPageSizeChange,
  editableProgramIds,
  disableAutoExpand = false,
  onExpandOffice,
  onReorderSection,
  onSummaryChange,
}: AIPMasterListProps) {
  const [totalsMode, setTotalsMode] = useState<'all' | 'page'>('all')
  // Bring the highlighted program into view once it has rendered (its office may expand first).
  const scrolledToHighlight = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightedId || scrolledToHighlight.current === highlightedId) return
    // The table renders its rows twice, one copy hidden per breakpoint: scroll to the visible one.
    const row = [...document.querySelectorAll('[data-highlighted-row]')].find((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 || r.height > 0
    })
    if (!row) return
    scrolledToHighlight.current = highlightedId
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  const { expandedIds, toggleExpand, isExpanded, expandId, setManyExpanded } =
    useAIPExpand()

  // Auto-expand the first row each time the leading program changes (tab switch,
  // page change, filter change). Tracking the last-expanded ID rather than a
  // boolean ensures the effect re-fires whenever `data[0]` is a new entry.
  const lastAutoExpandedId = useRef<string | null>(null)
  useEffect(() => {
    if (disableAutoExpand) return
    const firstId = data[0]?.id ?? null
    if (firstId && firstId !== lastAutoExpandedId.current) {
      expandId(firstId)
      lastAutoExpandedId.current = firstId
    }
  }, [data, expandId, disableAutoExpand])

  // A budget row that carries money and has no sub-rows is stored as a program
  // plus one PA holding the amount, because money lives on PAs. Collapse that
  // pair back into the single row the book prints. Applied before filtering,
  // grouping and totals so every one of them sees the same shape — in
  // particular, `expandableKeysIn` must not hand out keys for rows that no
  // longer have children.
  const collapsedData = useMemo(() => collapseMirroredChildren(data), [data])

  // Filter data based on search — skip when non-empty because the server already applied it
  const filteredData = useMemo(() => {
    if (searchTerm.trim()) return collapsedData
    return filterDataRecursive(collapsedData, searchTerm)
  }, [collapsedData, searchTerm])

  const officeGroups = useMemo(
    () =>
      groupOffices
        ? groupByOffice(
            filteredData,
            // A header sums the column under it, and that column differs by
            // caller: Proposed publicly, Total internally.
            useProposedTotals
              ? (entry) => entry.proposedBudget ?? '0'
              : undefined
          )
        : [],
    [groupOffices, filteredData, useProposedTotals]
  )

  useEffect(() => {
    if (!onSummaryChange) return
    onSummaryChange(
      groupOffices && totalItems > 0 ? { totalItems, officeCount: officeGroups.length } : null
    )
    return () => onSummaryChange(null)
  }, [onSummaryChange, groupOffices, totalItems, officeGroups.length])

  // Flatten data for display
  const displayRows = useMemo(() => {
    if (groupOffices) return flattenGroupedData(officeGroups, expandedIds)
    return flattenData(filteredData, expandedIds, 0, showPapClassSections)
  }, [
    groupOffices,
    officeGroups,
    filteredData,
    expandedIds,
    showPapClassSections,
  ])

  /**
   * Collapsed-by-default is right for browsing 53 offices and wrong as the answer
   * to a search, so a search expands every office holding a hit. A single group
   * expands too — an office-scoped encoder should not have to click their own
   * office open every time.
   *
   * Keyed on the group identity rather than a boolean so it re-fires when the
   * filters change, and only ever expands: collapsing here would fight the user.
   */
  const lastAutoExpandedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!groupOffices || officeGroups.length === 0) return

    const term = searchTerm.trim().toLowerCase()
    const keys =
      term.length > 0
        ? officeKeysMatching(officeGroups, (entry) =>
            [entry.program_name, entry.ppa_description, entry.program_code]
              .some((field) => field?.toLowerCase().includes(term))
          )
        : officeGroups.length === 1
          ? [officeGroupKey(officeGroups[0].officeId)]
          : []

    const signature = `${term}|${keys.join(',')}`
    if (keys.length === 0 || signature === lastAutoExpandedKey.current) return
    lastAutoExpandedKey.current = signature
    // Whole subtrees: a search hit is only legible with the PPAs under it.
    const keySet = new Set(keys)
    setManyExpanded(
      officeGroups
        .filter((group) => keySet.has(officeGroupKey(group.officeId)))
        .flatMap(expandableKeysIn),
      true
    )
  }, [groupOffices, officeGroups, searchTerm, setManyExpanded])

  /**
   * Drawer peek-navigation can step onto a row whose office or parent program
   * is still collapsed — it would highlight and try to scroll to a row that
   * was never rendered. Expand its whole branch so it always comes into view.
   */
  const lastEnsuredVisibleId = useRef<string | null>(null)
  useEffect(() => {
    if (!ensureVisibleId || ensureVisibleId === lastEnsuredVisibleId.current) return
    lastEnsuredVisibleId.current = ensureVisibleId
    if (groupOffices) {
      const group = officeGroups.find((g) => officeGroupContainsId(g, ensureVisibleId))
      if (group) setManyExpanded(expandableKeysIn(group), true)
    } else {
      const ancestors = findAncestorIds(filteredData, ensureVisibleId)
      if (ancestors && ancestors.length > 0) setManyExpanded(ancestors, true)
    }
  }, [ensureVisibleId, groupOffices, officeGroups, filteredData, setManyExpanded])

  // Redundant once the office is a section header, and it buys the name column
  // 15% of the width back — which the deeper indentation of a grouped tree needs.
  const showOfficeColumn = !groupOffices || showOfficeOnComponents

  /**
   * A component program prints under the office **hosting** it, so its band
   * header names an office that does not own it — the one piece of identity
   * grouping takes away rather than makes redundant. Those rows get the office
   * column back; every other row leaves it blank, because repeating the header
   * on each of its own rows is what hiding the column was for.
   */
  const officeCellFor = (entry: AIPEntry): string | null => {
    if (!groupOffices) return entry.office_name ?? null
    return entry.host_office_id ? (entry.office_name ?? null) : null
  }

  // Name + Finish Lines + PS/MOOE/FE/CO are always rendered; the rest are toggled.
  // Only the divider rows need this, to span the full table.
  /**
   * Every column but the name one is a fixed percentage; the name column takes
   * whatever is left, so the row always fills the table exactly.
   *
   * Computed rather than hard-coded because callers toggle six of these
   * independently — a single hard-coded width was right for one combination and
   * left a dead strip at the right edge for the rest. Applied as an inline style,
   * not a Tailwind class: an arbitrary value built at runtime (`w-[45%]`) is not
   * in the CSS bundle, so it would silently do nothing.
   */
  const hasRowActions = Boolean(
    onAddProject ||
      onAddActivity ||
      onViewProgram ||
      onViewProject ||
      onViewActivity,
  )

  const nameColumnWidth = (() => {
    const fixed =
      8 + // Finish Lines
      (showOfficeColumn ? 15 : 0) +
      (showStatus ? 9 : 0) +
      (showLastUpdated ? 12 : 0) +
      (showFeedbackCount ? 8 : 0) +
      (showBreakdown ? 24 : 0) + // PS + MOOE + FE + CO, 6 each
      (showProposed ? 10 : 0) +
      (showTotal ? 10 : 0) +
      (hasRowActions ? 7 : 0)
    // Never let the name column vanish if a caller enables everything at once.
    return `${Math.max(20, 100 - fixed)}%`
  })()

  const tableColumnCount =
    6 +
    (showOfficeColumn ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showLastUpdated ? 1 : 0) +
    (showFeedbackCount ? 1 : 0) +
    (showProposed ? 1 : 0) +
    (showTotal ? 1 : 0) +
    (hasRowActions ? 1 : 0)

  const grandTotals = useMemo(() => {
    // Every leaf, whatever its type. `collectLeafEntries` already excludes
    // parents structurally, so there is nothing to double count — and once a
    // mirrored pair collapses, the surviving row is a leaf *Program*. Filtering
    // to Project/Activity here used to be harmless; it would now drop 88% of an
    // imported cycle's money out of the page-scope total. A childless draft
    // program rolls up to 0 and contributes nothing either way.
    const leafEntries = collectLeafEntries(filteredData)

    return leafEntries.reduce(
      (acc, entry) => ({
        ps: acc.ps + (parseFloat(entry.ps_amount) || 0),
        mooe: acc.mooe + (parseFloat(entry.mooe_amount) || 0),
        fe: acc.fe + (parseFloat(entry.fe_amount) || 0),
        co: acc.co + (parseFloat(entry.co_amount) || 0),
        total:
          acc.total +
          (useProposedTotals
            ? parseFloat(entry.proposedBudget ?? '0') || 0
            : parseFloat(entry.total_amount) || 0),
      }),
      { ps: 0, mooe: 0, fe: 0, co: 0, total: 0 }
    )
  }, [filteredData, useProposedTotals])

  const displayTotals = totalsMode === 'all' && aggregateTotals
    ? {
        ps: parseFloat(aggregateTotals.ps) || 0,
        mooe: parseFloat(aggregateTotals.mooe) || 0,
        fe: parseFloat(aggregateTotals.fe ?? '0') || 0,
        co: parseFloat(aggregateTotals.co) || 0,
        total: parseFloat(aggregateTotals.total) || 0,
      }
    : grandTotals

  // Show empty state
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {emptyStateMessage ?? (hasActiveFilters
            ? 'No programs match your current filters.'
            : 'No programs created yet.')}
        </p>
      </div>
    )
  }

  // Show empty search results
  if (searchTerm.trim() && displayRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No results found for &quot;{searchTerm}&quot;
        </p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden font-sans [&_[data-slot=table-container]]:overflow-x-hidden">
      {/* Truncation has to be loud: a registry quietly missing programs is worse
          than one that admits it. Only reachable if a cycle outgrows the server's
          page ceiling. */}
      {groupOffices && totalItems > filteredData.length && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Showing the first {filteredData.length} of {totalItems} programs. Narrow
          the filters to see the rest.
        </div>
      )}

      {/* Mobile: card list */}
      <div className="md:hidden">
        <AIPCardList
          onExpandOffice={onExpandOffice}
          displayRows={displayRows}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          showBreakdown={showBreakdown}
          showProposed={showProposed}
          proposedLabel={proposedLabel}
          showStatus={showStatus}
          showLastUpdated={showLastUpdated}
          showTypeBadge={showTypeBadge}
          showFeedbackCount={showFeedbackCount}
          onViewProgram={onViewProgram}
          onViewProject={onViewProject}
          onViewActivity={onViewActivity}
          onAddProject={onAddProject}
          onAddActivity={onAddActivity}
          totalFinishLineCount={totalFinishLineCount}
          unreadIds={unreadIds}
          recentlyChangedIds={recentlyChangedIds}
          highlightedId={highlightedId}
          grandTotals={grandTotals}
          editableProgramIds={editableProgramIds}
          officeCellFor={officeCellFor}
          setManyExpanded={setManyExpanded}
        />
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="border-b border-tbl-rule bg-tbl-fill/80">
            <TableHead
              style={{ width: nameColumnWidth }}
              className="h-12 whitespace-normal text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2"
            >
              Program / Project / Activity
            </TableHead>
            <TableHead className="w-[8%] whitespace-normal text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
              {GOALS}
            </TableHead>
            {showOfficeColumn && (
              <TableHead className="w-[15%] whitespace-normal text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Implementing Office
              </TableHead>
            )}
            {showStatus && (
              <TableHead className="w-[9%] whitespace-normal text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Status
              </TableHead>
            )}
            {showLastUpdated && (
              <TableHead className="w-[12%] whitespace-normal text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Last Updated
              </TableHead>
            )}
            {showFeedbackCount && (
              <TableHead className="w-[8%] whitespace-normal text-center text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Feedback
              </TableHead>
            )}
            <TableHead className={`${showBreakdown ? 'hidden w-[6%] md:table-cell' : 'hidden'} whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2`}>
              PS
            </TableHead>
            <TableHead className={`${showBreakdown ? 'hidden w-[6%] md:table-cell' : 'hidden'} whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2`}>
              MOOE
            </TableHead>
            <TableHead className={`${showBreakdown ? 'hidden w-[6%] md:table-cell' : 'hidden'} whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2`}>
              FE
            </TableHead>
            <TableHead className={`${showBreakdown ? 'hidden w-[6%] md:table-cell' : 'hidden'} whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2`}>
              CO
            </TableHead>
            {showProposed && (
              <TableHead className="w-[10%] whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Proposed
              </TableHead>
            )}
            {showTotal && (
              <TableHead className="w-[10%] whitespace-normal text-right text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Total
              </TableHead>
            )}
            {(!!onAddProject || !!onAddActivity || !!onViewProgram || !!onViewProject || !!onViewActivity) && (
              <TableHead className="w-[7%] whitespace-normal text-center text-xs font-semibold uppercase tracking-[0.08em] text-tbl-muted-2">
                Actions
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map((row) => {
            if (row.divider) {
              const { kind, key, label, sublabel, programCount, total, expanded } =
                row.divider
              if (kind === 'office') {
                return (
                  <TableRow
                    key={`office-${key}`}
                    // The jump-to-office control scrolls to this id.
                    id={`office-row-${key}`}
                    className="border-y border-tbl-rule-strong bg-tbl-band-office hover:bg-tbl-band-office-hover has-aria-expanded:bg-tbl-band-office has-aria-expanded:hover:bg-tbl-band-office-hover"
                  >
                    <TableCell colSpan={tableColumnCount} className="p-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => {
                          if (!expanded) onExpandOffice?.()
                          setManyExpanded(row.divider!.expandKeys ?? [key], !expanded)
                        }}
                        className="flex w-full items-center px-4 py-2.5 text-left"
                      >
                        <OfficeDividerContent
                          label={label}
                          sublabel={sublabel}
                          programCount={programCount}
                          total={total}
                          expanded={expanded}
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              }
              return (
                <TableRow
                  key={`section-${key}`}
                  className="border-y border-tbl-rule bg-tbl-band-section hover:bg-tbl-band-section"
                >
                  <TableCell
                    colSpan={tableColumnCount}
                    className="py-2 pl-10 text-xs font-semibold uppercase tracking-[0.12em] text-tbl-muted"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{label}</span>
                      {onReorderSection && row.divider.officeId && row.divider.papClass && (
                        <button
                          type="button"
                          onClick={() =>
                            onReorderSection({
                              officeId: row.divider!.officeId!,
                              officeLabel: row.divider!.officeLabel ?? '',
                              papClass: row.divider!.papClass!,
                              label,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-tbl-rule-strong bg-tbl-surface px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-tbl-muted hover:bg-tbl-fill-strong"
                        >
                          <ArrowUpDown className="h-3 w-3" aria-hidden />
                          Reorder
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            }
            const { entry, depth, hasChildren } = row
            const isExpand = isExpanded(entry.id)
            const amounts = getEffectiveAmounts(entry, expandedIds)
            const isProgram = entry.ppa_type === "Program"
            const isProject = entry.ppa_type === "Project"
            const typeBadgeClass = getTypeBadgeClass(entry.ppa_type)
            const title = entry.program_name || entry.ppa_description || "Unnamed"
            const viewEntry = () => {
              if (entry.ppa_type === "Program") onViewProgram?.(entry.id)
              if (entry.ppa_type === "Project") onViewProject?.(entry.id)
              if (entry.ppa_type === "Activity") onViewActivity?.(entry.id)
            }
            const canViewEntry =
              (entry.ppa_type === "Program" && !!onViewProgram) ||
              (entry.ppa_type === "Project" && !!onViewProject) ||
              (entry.ppa_type === "Activity" && !!onViewActivity)

            // Program row styling
            const rowClasses = isProgram
              ? "bg-tbl-row-program hover:bg-tbl-row-program-hover font-medium"
              : isProject
                ? "bg-tbl-row-project hover:bg-tbl-row-project-hover"
                : "bg-tbl-row-activity hover:bg-tbl-row-activity-hover"

            const isUnread = isProgram && !!unreadIds?.has(entry.id)
            const justChanged =
              isProgram && !!recentlyChangedIds?.has(entry.id)
            const highlighted = !!highlightedId && entry.id === highlightedId

            return (
              <TableRow
                key={entry.id}
                tabIndex={canViewEntry ? 0 : undefined}
                className={cn(
                  "group h-[76px] border-t border-tbl-rule transition-colors",
                  canViewEntry && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tbl-accent",
                  rowClasses,
                  !isProgram && "text-sm",
                  justChanged && "animate-pulse bg-amber-50",
                  highlighted && HIGHLIGHT_RING
                )}
                data-highlighted-row={highlighted || undefined}
                onClick={() => {
                  if (canViewEntry) {
                    viewEntry()
                  }
                }}
                onKeyDown={canViewEntry ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    viewEntry()
                  }
                } : undefined}
              >
                {/* Name Column */}
                <TableCell
                  className={cn(
                    "h-[76px] overflow-hidden whitespace-normal py-2 align-middle",
                    isUnread && UNREAD_STRIPE,
                  )}
                >
                  <div
                    className="flex h-[60px] min-w-0 items-center gap-2 overflow-hidden"
                    style={{ paddingLeft: `${depth * 32}px` }}
                  >
                    {hasChildren ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(entry.id)
                        }}
                        aria-expanded={isExpand}
                        aria-label={isExpand ? 'Collapse activities' : 'Expand activities'}
                        className="flex w-6 flex-shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-tbl-fill-strong"
                      >
                        {isExpand ? (
                          <ChevronDown className="h-6 w-6 text-tbl-accent" />
                        ) : (
                          <ChevronRight className="h-6 w-6 text-tbl-accent" />
                        )}
                      </button>
                    ) : (
                      <div className={cn("flex-shrink-0", isProject ? "w-6" : "w-4")} />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      <div className="flex min-w-0 items-start gap-2">
                        {isUnread && (
                          <span className="sr-only">{UNREAD_LABEL}</span>
                        )}
                        {isProgram && (
                          <ImportWarningMarker
                            importWarnings={entry.importWarnings ?? []}
                            dataWarnings={entry.dataWarnings ?? []}
                          />
                        )}
                        {canViewEntry ? (
                          <button
                            type="button"
                            className={cn(
                              "line-clamp-2 min-w-0 flex-1 text-left text-sm leading-5 text-tbl-accent-ink-2 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tbl-accent focus-visible:ring-offset-2",
                              isProgram ? "font-semibold" : "font-medium"
                            )}
                            title={title}
                            onClick={(event) => {
                              event.stopPropagation()
                              viewEntry()
                            }}
                          >
                            {title}
                          </button>
                        ) : (
                          <div
                            className={cn(
                              "line-clamp-2 min-w-0 flex-1 text-sm leading-5",
                              isProgram ? "font-medium" : "font-normal"
                            )}
                            title={title}
                          >
                            {title}
                          </div>
                        )}
                        {showTypeBadge && entry.ppa_type !== 'Program' && (
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap",
                              typeBadgeClass
                            )}
                          >
                            {entry.ppa_type}
                          </span>
                        )}
                      </div>

                      {entry.program_code && (
                        <div className="flex min-w-0 items-center gap-2 text-xs font-normal tabular-nums text-muted-foreground">
                          <span className="truncate">{entry.program_code}</span>
                          <SpecialFundBadges funds={entry.specialFunds} />
                          <SourceRowLink source={entry.source} />
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Finish Lines */}
                <TableCell className="whitespace-normal py-2 align-middle">
                  <FinishLinesCell entry={entry} totalFinishLineCount={totalFinishLineCount} />
                </TableCell>

                {/* Implementing office (program rows only) — blank when the
                    office is already the section header above, filled on a
                    component program, whose header names its host instead. */}
                {showOfficeColumn && (
                  <TableCell className="whitespace-normal py-2 align-middle text-sm text-tbl-ink-3">
                    {isProgram ? officeCellFor(entry) : null}
                  </TableCell>
                )}

                {/* Status */}
                {showStatus && (
                  <TableCell className="whitespace-normal py-2 align-middle">
                    <StatusBadge status={entry.status_label ?? entry.status} />
                  </TableCell>
                )}

                {/* Last Updated (program rows only) */}
                {showLastUpdated && (
                  <TableCell className="whitespace-normal py-2 align-middle text-xs text-tbl-muted-2">
                    {isProgram && entry.lastUpdatedAt ? (
                      <Tooltip>
                        <TooltipTrigger className="cursor-default">
                          {formatRelativeDate(entry.lastUpdatedAt)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(entry.lastUpdatedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                )}

                {/* Feedback count (program rows only) */}
                {showFeedbackCount && (
                  <TableCell className="py-2 align-middle text-center">
                    {isProgram && (entry.feedbackCount ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-tbl-muted-2">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {entry.feedbackCount}
                      </span>
                    ) : null}
                  </TableCell>
                )}

                {/* PS Amount */}
                <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-2 align-middle`}>
                  <BudgetCell amount={amounts.ps} />
                </TableCell>

                {/* MOOE Amount */}
                <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-2 align-middle`}>
                  <BudgetCell amount={amounts.mooe} />
                </TableCell>

                {/* FE Amount */}
                <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-2 align-middle`}>
                  <BudgetCell amount={amounts.fe} />
                </TableCell>

                {/* CO Amount */}
                <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-2 align-middle`}>
                  <BudgetCell amount={amounts.co} />
                </TableCell>

                {/* Proposed Amount */}
                {showProposed && (
                  <TableCell className="py-2 align-middle">
                    <BudgetCell amount={(!hasChildren || !isExpand) && entry.proposedBudget ? parseFloat(entry.proposedBudget) || 0 : 0} />
                  </TableCell>
                )}

                {/* Total Amount */}
                {showTotal && (
                  <TableCell className="py-2 align-middle">
                    <TotalAmountCell total={amounts.total} />
                  </TableCell>
                )}

                {/* Actions */}
                {(!!onAddProject || !!onAddActivity || !!onViewProgram || !!onViewProject || !!onViewActivity) && (
                  <TableCell className="whitespace-normal py-2 text-center align-middle">
                    <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                      {isProgram && (
                        <>
                          <ActionIconButton
                            label="View program"
                            icon={Eye}
                            onClick={(e) => {
                              e.stopPropagation()
                              onViewProgram?.(entry.id)
                            }}
                          />
                          {onAddProject && (!editableProgramIds || editableProgramIds.has(entry.id)) && (
                            <ActionIconButton
                              label="Add project"
                              icon={Plus}
                              onClick={(e) => {
                                e.stopPropagation()
                                onAddProject(entry.id)
                              }}
                            />
                          )}
                        </>
                      )}
                      {isProject && (
                        <>
                          <ActionIconButton
                            label="View project"
                            icon={Eye}
                            onClick={(e) => {
                              e.stopPropagation()
                              onViewProject?.(entry.id)
                            }}
                          />
                          {/* Same fix as the row above — gate on the owning program. */}
                          {entry.costMode === 'ACTIVITY_CHILDREN' && onAddActivity && (!editableProgramIds || editableProgramIds.has(entry.programId ?? '')) && (
                            <ActionIconButton
                              label="Add activity"
                              icon={Plus}
                              onClick={(e) => {
                                e.stopPropagation()
                                onAddActivity(entry.id, entry.programId)
                              }}
                            />
                          )}
                        </>
                      )}
                      {entry.ppa_type === "Activity" && (
                        <ActionIconButton
                          label="View activity"
                          icon={Eye}
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewActivity?.(entry.id)
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>

        {showTableFooter && <TableFooter>
          <TableRow className="border-t border-tbl-rule bg-tbl-fill/80">
            {/* Name + Finish Lines, plus whichever of the label-side columns are
                on. The base used to be a hard 3, which counted the office column
                even when the grouped view hides it — one cell too many, so every
                figure shifted right and the grand total spilled past the table. */}
            <TableCell
              colSpan={
                2 +
                (showOfficeColumn ? 1 : 0) +
                (showStatus ? 1 : 0) +
                (showLastUpdated ? 1 : 0) +
                (showFeedbackCount ? 1 : 0)
              }
              className="whitespace-normal py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Grand Total</span>
                <span className="text-[10px] text-muted-foreground">
                  {totalsMode === 'page' && onPageChange
                    ? '(Projects & Activities — this page)'
                    : '(All matching programs)'}
                </span>
                {/* Only meaningful where there are pages to contrast with the
                    whole result set. The staff registry lists a whole cycle, so
                    "Page" would just repeat "Overall". */}
                {aggregateTotals && onPageChange && (
                  <div
                    role="group"
                    aria-label="Total scope"
                    className="inline-flex rounded border border-tbl-rule bg-tbl-fill p-0.5 text-[10px]"
                  >
                    <button
                      type="button"
                      aria-pressed={totalsMode === 'all'}
                      onClick={() => setTotalsMode('all')}
                      className={cn(
                        'rounded px-1.5 py-0.5 transition-colors',
                        totalsMode === 'all'
                          ? 'bg-tbl-surface text-tbl-ink-2 shadow-sm'
                          : 'text-tbl-faint hover:text-tbl-muted',
                      )}
                    >
                      Overall
                    </button>
                    <button
                      type="button"
                      aria-pressed={totalsMode === 'page'}
                      onClick={() => setTotalsMode('page')}
                      className={cn(
                        'rounded px-1.5 py-0.5 transition-colors',
                        totalsMode === 'page'
                          ? 'bg-tbl-surface text-tbl-ink-2 shadow-sm'
                          : 'text-tbl-faint hover:text-tbl-muted',
                      )}
                    >
                      Page
                    </button>
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-3 text-right text-xs font-semibold tabular-nums text-muted-foreground`}>
              <FooterFigure label="PS">
                {displayTotals.ps ? (
                  <Tooltip><TooltipTrigger>{formatMillions(displayTotals.ps)}</TooltipTrigger><TooltipContent>{formatExact(displayTotals.ps)}</TooltipContent></Tooltip>
                ) : formatMillions(displayTotals.ps)}
              </FooterFigure>
            </TableCell>
            <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-3 text-right text-xs font-semibold tabular-nums text-muted-foreground`}>
              <FooterFigure label="MOOE">
                {displayTotals.mooe ? (
                  <Tooltip><TooltipTrigger>{formatMillions(displayTotals.mooe)}</TooltipTrigger><TooltipContent>{formatExact(displayTotals.mooe)}</TooltipContent></Tooltip>
                ) : formatMillions(displayTotals.mooe)}
              </FooterFigure>
            </TableCell>
            <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-3 text-right text-xs font-semibold tabular-nums text-muted-foreground`}>
              <FooterFigure label="FE">
                {displayTotals.fe ? (
                  <Tooltip><TooltipTrigger>{formatMillions(displayTotals.fe)}</TooltipTrigger><TooltipContent>{formatExact(displayTotals.fe)}</TooltipContent></Tooltip>
                ) : formatMillions(displayTotals.fe)}
              </FooterFigure>
            </TableCell>
            <TableCell className={`${showBreakdown ? 'hidden md:table-cell' : 'hidden'} py-3 text-right text-xs font-semibold tabular-nums text-muted-foreground`}>
              <FooterFigure label="CO">
                {displayTotals.co ? (
                  <Tooltip><TooltipTrigger>{formatMillions(displayTotals.co)}</TooltipTrigger><TooltipContent>{formatExact(displayTotals.co)}</TooltipContent></Tooltip>
                ) : formatMillions(displayTotals.co)}
              </FooterFigure>
            </TableCell>
            {/* Proposed footer cell — empty when Total column is visible; shows grand total otherwise */}
            {showProposed && (
              <TableCell className="py-3 text-right tabular-nums">
                {!showTotal && (
                  displayTotals.total ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-sm font-medium text-primary">{formatMillions(displayTotals.total, { includeCurrency: true, autoScale: true })}</span>
                      </TooltipTrigger>
                      <TooltipContent>{formatExact(displayTotals.total)}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-sm font-medium text-primary">{formatMillions(displayTotals.total, { includeCurrency: true, autoScale: true })}</span>
                  )
                )}
              </TableCell>
            )}
            {showTotal && (
              <TableCell className="py-3 text-right tabular-nums">
                <FooterFigure label="Total">
                  {displayTotals.total ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-sm font-medium text-primary">{formatMillions(displayTotals.total, { includeCurrency: true, autoScale: true })}</span>
                      </TooltipTrigger>
                      <TooltipContent>{formatExact(displayTotals.total)}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-sm font-medium text-primary">{formatMillions(displayTotals.total, { includeCurrency: true, autoScale: true })}</span>
                  )}
                </FooterFigure>
              </TableCell>
            )}
            <TableCell className="py-3" />
          </TableRow>
        </TableFooter>}
      </Table>
      </div>
      {onPageChange && (
        <div className="flex items-center justify-between gap-2 border-t border-tbl-rule bg-tbl-surface px-4 py-3">
          {/* Left: Grand total (merged footer mode) OR range + rows per page */}
          <div className="flex items-center gap-4">
            {!showTableFooter && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-tbl-muted-2">Grand Total</span>
                <span className="text-xs text-tbl-faint">(All matching programs)</span>
                <span className="text-sm font-semibold tabular-nums text-tbl-accent-ink">
                  {formatMillions(displayTotals.total, { includeCurrency: true, autoScale: true })}
                </span>
              </div>
            )}
            {/* Per-page selector + range indicator */}
            <div className="flex items-center gap-3 text-xs text-tbl-muted-2">
              {totalItems > 0 && (
                <span className="tabular-nums">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span>Rows per page</span>
                <SimpleSelect
                  aria-label="Rows per page"
                  size="sm"
                  className="h-7 w-auto px-2 text-xs"
                  options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(pageSize)}
                  onChange={(next) => onPageSizeChange?.(Number(next))}
                />
              </div>
            </div>
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Prev
              </Button>
              {getPaginationPages(page, totalPages).map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => { if (p !== page) onPageChange(p as number); }}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
