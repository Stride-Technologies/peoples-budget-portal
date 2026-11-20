# Module: `lfc`

> **Phase 1 status: dormant.** The LFC sequential approval gate is not part of
> the Phase 1 publish-with-estimates workflow. Its schema, tables, and rows are
> retained, and the working implementation is preserved on
> `archive/full-approval-workflow` as reference for the redesigned review flow
> (it will not be restored as-is). See
> `docs/design/phase-1-publish-scope.md` §3.5.


**Folder:** `api/src/lfc/` — removed from `dev`; lives on `archive/full-approval-workflow`.

## Purpose

Exposes the **Approver view** API for LFC (Local Finance Committee) member office HEADs. Provides membership lookup, per-cycle office statistics, full signatory data, and batch approve/return actions. All mutations delegate to `ProgramWorkflowService.decideLfcApproval` — the same helper used by the single-program drawer path — ensuring both paths behave identically under the sequential model. SUPER_ADMIN has **read/view** access to the board but can **no longer cast a committee office's decision** (endorser pivot OD-3): the LFC committee is the sole approval authority.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/lfc/me` | Any authenticated user | Check whether the caller's office is an LFC member |
| GET | `/lfc/offices?cycleId=` | LFC HEAD or SUPER_ADMIN | List implementing offices with programs in the cycle + per-reviewer stats |
| GET | `/lfc/offices/:officeId?cycleId=` | LFC HEAD or SUPER_ADMIN | Full detail for one implementing office: stats + signatory list |
| POST | `/lfc/offices/:officeId/approve-all` | LFC HEAD (own office only) | Batch-approve all PENDING rows for the caller's LFC office |
| POST | `/lfc/offices/:officeId/return-all` | LFC HEAD (own office only) | Batch-**return** (recoverable → `FOR_REVISION`) all PENDING rows with required revision notes |
| POST | `/lfc/offices/:officeId/reject-all` | LFC HEAD (own office only) | Batch-**reject** (terminal → `REJECTED`, no final code) all PENDING rows with a required reason |

All routes are authenticated (`JwtGuard` is global). No `@Public()`. RBAC is enforced at the service layer.

**Return vs reject.** A *return* is recoverable — the program goes to `FOR_REVISION` for the proponent to revise and resubmit. Terminal **rejection is deprecated** in the normal LFC flow: `REJECTED` decisions and `reject-all` now return `400`. A return is driven by `decideLfcApproval` (single-program) or `return-all`, writes the office's `ProgramApproval(status=RETURNED)` row, and pauses the batch.

## Batch-gated sequential approval model

LFC review is **sequential by office** (`CommitteeMembership.sequenceOrder`) **and gated per proponent-office batch**. A proponent office's HEAD submits programs into a persisted `ProgramApprovalBatch` (one open batch per office + cycle, `closedAt = null`). The batch tracks `currentSequenceOrder` — the LFC office currently acting. **The batch advances office-by-office only when every in-scope program clears the current office**, and finalizes only when the **last** office has approved them all. In-scope = a program whose current `ProgramVersion.approvalBatchId` points at the batch and whose status is `PENDING_APPROVAL` (or `FOR_REVISION`, awaiting resubmit).

When a batch is submitted (`HEAD_REVIEWED → PENDING_APPROVAL`), `ProgramWorkflowService.batchSubmitForApproval` finds-or-creates the open batch, binds each program's current version to it, and creates a `ProgramApproval(status=PENDING)` row at the batch's current office (the first office for a fresh batch). Late joiners — a resubmitted return or a brand-new program added while the batch is paused — join the active batch at its current office and **inherit** ordinary `APPROVED` rows (with a system note) for every earlier office. If the LFC committee has no members, it fast-paths straight to `finalizeApproval` → `APPROVED`.

Each decision runs through `decideLfcApproval` → `advanceBatchIfReady`:

- `APPROVED` writes the office's row, then evaluates the **batch gate**. If any in-scope sibling (including a returned `FOR_REVISION` one) has not cleared the current office, nothing else happens — the approved program stays `PENDING_APPROVAL` and waits.
- Gate passed **and a later office exists** → create the next office's `PENDING` rows for **all** in-scope programs and bump `currentSequenceOrder`.
- Gate passed **and this is the last office** → `finalizeApproval` runs for **all** in-scope programs and the batch is closed (`closedAt`); each program → `APPROVED` with AIP reference codes.
- `RETURNED` → the program drops to `FOR_REVISION` (the batch pauses at the returning office); creates a root `ProgramComment(stage=APPROVAL)` the proponent must resolve before resubmitting.

Because only the current office has actionable `PENDING` rows, an office further down the sequence simply has no rows yet — the batch loader (`loadPendingApprovalEntries`) treats programs without a row for the caller's office as not-yet-actionable. Approval rows that predate the batch model (no `approvalBatchId`) fall back to the legacy per-program chain (`legacyAdvanceSingle`).

## `GET /lfc/me`

Returns LFC membership status for the caller's office. Called by the frontend to decide whether to show the Approver chip toggle.

```json
{ "isLfcMember": true, "officeId": "uuid", "sequenceOrder": 2 }
```

Returns `{ isLfcMember: false, officeId: null, sequenceOrder: null }` for SUPER_ADMIN (no `officeId`) and for non-LFC offices.

## `GET /lfc/offices?cycleId`

Lists all `Office` entities that have at least one program (any status) in the cycle. Only LGU implementing offices (`officeId`) are included; NCPC programs are excluded.

**Per-office stat fields:**
- `totalProgramCount` — total programs in the cycle from this office
- `myApprovedCount / myPendingCount / myRejectedCount` — count of `ProgramApproval` rows for the caller's LFC office, grouped by status

**SUPER_ADMIN limitation:** Since SUPER_ADMIN has no `officeId`, all offices show `myPendingCount = totalProgramCount` and `myApprovedCount = myRejectedCount = 0`. This is an accepted limitation documented in the Approver view design.

**Frontend-derived stat card values** (computed from the raw counts):
- **Waiting** — `myApprovedCount === 0 && myRejectedCount === 0`
- **In Progress** — `myPendingCount > 0 && (myApprovedCount > 0 || myRejectedCount > 0)`
- **Approved** — `myPendingCount === 0 && myApprovedCount > 0`

## `GET /lfc/offices/:officeId?cycleId`

Full detail for one implementing office. Combines:
- `stats` — same shape as the list endpoint but scoped to the specified office
- `signatories` — all LFC member offices ordered by `sequenceOrder`, each with:
  - `approvedCount / pendingCount / rejectedCount` across programs for this office in the cycle
  - `lastDecidedByName / lastDecidedAt` from the most recent `decidedAt` row
  - `isCallerOffice` — whether this row is the caller's own office (used to render the Approve All / Return for Revision buttons)

**Signatory status** is derived on the frontend using severity-wins: any `rejectedCount > 0` → REJECTED; `pendingCount === 0` → APPROVED; else PENDING.

## `POST /lfc/offices/:officeId/approve-all`

Batch-approves all `PENDING_APPROVAL` programs in the cycle for the specified implementing office (`:officeId`) where the LFC member office's own `ProgramApproval` row is still `PENDING`.

- `:officeId` in the route is the **LFC member office** (not the implementing office). The caller must be the HEAD whose own `officeId` equals `:officeId` — SUPER_ADMIN can no longer act on a committee office's behalf (endorser pivot OD-3).
- Runs inside a single `$transaction`. Skips rows where `status !== PENDING` (idempotent).
- After the transaction commits, emits one `program.status` SSE event per affected program.

**Request:** `{ "cycleId": "uuid" }`

**Response:** `{ "approved": N, "finalized": N, "skipped": N }`

## `POST /lfc/offices/:officeId/return-all`

Batch-returns (rejects) all `PENDING_APPROVAL` programs in the cycle where the LFC member office's own row is `PENDING`.

- `notes` is **required** (`@IsNotEmpty()`). The same notes string is attached to every affected program's `ProgramComment`.
- Each rejected program gets one root `ProgramComment(stage=APPROVAL, resolvedAt=null)`. The proponent must resolve all comment threads before resubmitting (§6 invariant 12 in `aip-reference.md`).
- Emits `program.status` events post-transaction.

**Request:** `{ "cycleId": "uuid", "notes": "Please revise the budget breakdown." }`

**Response:** `{ "returned": N, "skipped": N }`

## Services

- **`LfcService`** — all endpoint handlers, RBAC helpers (`assertLfcAuthorized`, `assertLfcBatchAuth`), batch loader (`loadPendingApprovalEntries`), and the five public methods.
- **`ProgramWorkflowService.decideLfcApproval`** — the sequential advance/finalize state transition. Called by both the batch endpoints (via `LfcService`) and the single-program drawer path.

## DTOs

- `LfcBatchApproveDto` — `{ cycleId: UUID }`
- `LfcBatchReturnDto` — `{ cycleId: UUID, notes: string (non-empty) }`

## Tables touched

`Program`, `ProgramVersion`, `ProgramApproval`, `ProgramComment`, `Office`, `Committee`, `CommitteeMembership`, `User`, `AIPCodeCounter` (via `finalizeApproval`)

## Dependencies

`PrismaService`, [`ProgramWorkflowService`](programs.md) (for `applyLfcDecision`), `EventsService` (for SSE notifications)
