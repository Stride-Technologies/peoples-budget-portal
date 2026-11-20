/**
 * Centralized ProgramStatus color scheme.
 * Accepts either humanized labels ("Head Reviewed") or raw enum keys ("HEAD_REVIEWED").
 */

const STATUS_COLORS: Record<string, { solid: string; bordered: string }> = {
  // Raw enum keys
  DRAFT:               { solid: "bg-slate-100 text-slate-700",   bordered: "border-slate-300/60 bg-slate-100/50 text-slate-900" },
  FOR_REVISION:        { solid: "bg-amber-100 text-amber-700",   bordered: "border-amber-300/60 bg-amber-100/50 text-amber-900" },
  SUBMITTED:           { solid: "bg-sky-100 text-sky-700",       bordered: "border-sky-300/60 bg-sky-100/50 text-sky-900" },
  HEAD_REVIEWED:       { solid: "bg-indigo-100 text-indigo-700", bordered: "border-indigo-300/60 bg-indigo-100/50 text-indigo-900" },
  PENDING_APPROVAL:    { solid: "bg-violet-100 text-violet-700", bordered: "border-violet-300/60 bg-violet-100/50 text-violet-900" },
  APPROVED:            { solid: "bg-emerald-100 text-emerald-700", bordered: "border-emerald-300/60 bg-emerald-100/50 text-emerald-900" },
  REJECTED:            { solid: "bg-rose-100 text-rose-700",     bordered: "border-rose-300/60 bg-rose-100/50 text-rose-900" },
  // Phase 1: green = live on the public registry, amber = diverging from it.
  PUBLISHED:           { solid: "bg-emerald-100 text-emerald-700", bordered: "border-emerald-300/60 bg-emerald-100/50 text-emerald-900" },
  PUBLISHED_REVISION:  { solid: "bg-amber-100 text-amber-700",   bordered: "border-amber-300/60 bg-amber-100/50 text-amber-900" },
  // specs/013: superseded, kept for its history, counted nowhere.
  ARCHIVED:            { solid: "bg-zinc-200 text-zinc-600",     bordered: "border-zinc-300/60 bg-zinc-100/50 text-zinc-700" },
}

const LABEL_TO_KEY: Record<string, string> = {
  "Draft":               "DRAFT",
  "For Revision":        "FOR_REVISION",
  "Submitted":           "SUBMITTED",
  "Head Reviewed":       "HEAD_REVIEWED",
  "Pending Approval":    "PENDING_APPROVAL",
  "For Review":          "PENDING_APPROVAL",
  "Under Review":        "PENDING_APPROVAL",
  "Approved":            "APPROVED",
  "Rejected":            "REJECTED",
  "Published":           "PUBLISHED",
  "Revision":            "PUBLISHED_REVISION",
  "Draft changes":       "PUBLISHED_REVISION",
  "Archived":            "ARCHIVED",
}

function resolveKey(status: string): string {
  return STATUS_COLORS[status] ? status : (LABEL_TO_KEY[status] ?? "DRAFT")
}

/**
 * Strict resolver for permission checks. Unlike `resolveKey`, an unrecognized
 * status returns `null` rather than falling back to DRAFT — a colour fallback is
 * cosmetic, but a permission fallback would hand out edit rights on a status we
 * failed to parse.
 */
export function toProgramStatusKey(status: string | null | undefined): string | null {
  if (!status) return null
  if (STATUS_COLORS[status]) return status
  if (LABEL_TO_KEY[status]) return LABEL_TO_KEY[status]
  // Callers pass a mix of raw enum keys, humanized labels, and legacy lowercase
  // spellings ("for revision"). Normalizing here keeps every call site from
  // having to know which form it holds.
  const normalized = status.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return STATUS_COLORS[normalized] ? normalized : null
}

/**
 * Mirrors `api/src/programs/program-status.constants.ts` exactly. Keep the two
 * in sync: the API is the authority, and any status it accepts but the client
 * omits shows up as a control that is greyed out for an action the server would
 * happily have allowed.
 *
 * The sets differ on purpose — a published AIP stays editable while a revision
 * is open, but is never deletable, so an open revision can't become a route to
 * deleting a public budget document.
 */
const EDITABLE_PROGRAM_STATUSES = ["DRAFT", "FOR_REVISION", "PUBLISHED_REVISION"]
const DELETABLE_PROGRAM_STATUSES = ["DRAFT", "FOR_REVISION"]

/** True when the program (and its PAs and line items) can be structurally edited. */
export function isEditableProgramStatus(status: string | null | undefined): boolean {
  const key = toProgramStatusKey(status)
  return key !== null && EDITABLE_PROGRAM_STATUSES.includes(key)
}

/**
 * True when the **program** can be deleted by its owning office.
 *
 * Not the gate for deleting a Project/Activity inside one. The API guards PA
 * delete with `isEditableStatus` (`ProjectActivitiesService.remove`), because
 * dropping a PPA from an open revision is a working-copy edit — the public keeps
 * seeing the published snapshot until someone republishes. Using this function
 * there disables Delete on every PPA in a revision for an action the server
 * accepts; use `isEditableProgramStatus` for PA-level actions.
 */
export function isDeletableProgramStatus(status: string | null | undefined): boolean {
  const key = toProgramStatusKey(status)
  return key !== null && DELETABLE_PROGRAM_STATUSES.includes(key)
}

/** True when the program is published, in either of its two states. */
export function isPublishedProgramStatus(status: string | null | undefined): boolean {
  const key = toProgramStatusKey(status)
  return key === "PUBLISHED" || key === "PUBLISHED_REVISION"
}

/** Opaque pill — for list views, tables, and dashboards. */
export function getProgramStatusSolidClass(status: string): string {
  return STATUS_COLORS[resolveKey(status)]?.solid ?? "bg-slate-100 text-slate-700"
}

/** Bordered translucent chip — for drawer headers and inline chips. */
export function getProgramStatusBorderedClass(status: string): string {
  return STATUS_COLORS[resolveKey(status)]?.bordered ?? "border-slate-300/60 bg-slate-100/50 text-slate-900"
}
