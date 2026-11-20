import { ProgramStatus } from '../generated/prisma/index';

/**
 * Statuses in which a program — and its Project/Activities, line items, and
 * climate tags — can be structurally edited.
 *
 * `DRAFT` is a brand-new, never-published program. `FOR_REVISION` is a program
 * that was returned for changes by the LFC committee. `PUBLISHED_REVISION` is a
 * published program with an unpublished draft on top (Phase 1 D8): the live rows
 * are the working copy, while the public keeps seeing the last published
 * snapshot.
 *
 * `PUBLISHED` is deliberately absent. Editability is derived from status
 * throughout this codebase, so leaving PUBLISHED out is what gives the checkable
 * invariant "for any PUBLISHED program, live rows equal publishedVersionId's
 * snapshot" — which in turn makes discard-draft trivially correct. Opening a
 * revision is therefore an explicit, permissioned, logged act
 * (`POST /programs/:id/revise`) rather than a side effect of a keystroke.
 */
export const EDITABLE_PROGRAM_STATUSES: ProgramStatus[] = [
  ProgramStatus.DRAFT,
  ProgramStatus.FOR_REVISION,
  ProgramStatus.PUBLISHED_REVISION,
];

/** True when a program in this status can be structurally edited. */
export function isEditableStatus(status: ProgramStatus): boolean {
  return EDITABLE_PROGRAM_STATUSES.includes(status);
}

/**
 * Destructive operations. **Never includes a published program**, in either of
 * its states.
 *
 * Reusing the editable set here would make a published AIP deletable by any
 * encoder who happened to open a revision — a public budget document vanishing
 * because someone was mid-edit. The SUPER_ADMIN override is unchanged and
 * handled at the call site.
 */
export const DELETABLE_PROGRAM_STATUSES: ProgramStatus[] = [
  ProgramStatus.DRAFT,
  ProgramStatus.FOR_REVISION,
];

/** True when a program in this status can be soft-deleted by its owner. */
export function isDeletableStatus(status: ProgramStatus): boolean {
  return DELETABLE_PROGRAM_STATUSES.includes(status);
}

/**
 * Statuses from which the (Phase 2) submit transition is legal.
 *
 * Explicitly excludes `PUBLISHED_REVISION` so the Phase 2 merge from
 * `archive/full-approval-workflow` cannot accidentally push a published AIP back
 * into the approval chain.
 */
export const SUBMITTABLE_PROGRAM_STATUSES: ProgramStatus[] = [
  ProgramStatus.DRAFT,
  ProgramStatus.FOR_REVISION,
];

/** True when a program in this status may be submitted for review. */
export function isSubmittableStatus(status: ProgramStatus): boolean {
  return SUBMITTABLE_PROGRAM_STATUSES.includes(status);
}

/**
 * Statuses during which a program is under active review and may receive an
 * advisory endorsement (NCPC endorser pivot §3.2 — endorsement is non-gating).
 * Spans SUBMITTED through PENDING_APPROVAL.
 */
export const ENDORSABLE_PROGRAM_STATUSES: ProgramStatus[] = [
  ProgramStatus.SUBMITTED,
  ProgramStatus.HEAD_REVIEWED,
  ProgramStatus.PENDING_APPROVAL,
];

/** True when a program in this status can receive an advisory endorsement. */
export function isEndorsableStatus(status: ProgramStatus): boolean {
  return ENDORSABLE_PROGRAM_STATUSES.includes(status);
}

/** True when the program is published, in either of its two states. */
export function isPublishedStatus(status: ProgramStatus): boolean {
  return (
    status === ProgramStatus.PUBLISHED ||
    status === ProgramStatus.PUBLISHED_REVISION
  );
}
