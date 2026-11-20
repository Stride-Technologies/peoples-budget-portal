# Module: `project-activities`

**Folder:** `api/src/project-activities/`

## Purpose

Manages `ProjectActivity` rows — the project/activity children of a Program.
Each PA has `type: PROJECT | ACTIVITY`, holds line items, and may carry one
climate-change tag.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/programs/:programId/project-activities` | Authenticated | Add a PA to a `DRAFT` program |
| PATCH | `/programs/:programId/project-activities/reorder` | Authenticated | Reorder one sibling group, renumbering their tentative codes |
| GET | `/project-activities/:id` | Authenticated | Get one PA with its line items and climate tag |
| PATCH | `/project-activities/:id` | Authenticated | Update a PA (parent program must be `DRAFT`) |
| DELETE | `/project-activities/:id` | Authenticated | Hard-delete a PA; siblings renumber to close the gap |

## Status inheritance

A `ProjectActivity` has **no status column** — it inherits the parent Program's
status at query time. The practical consequence:

- PAs can be created, edited, reordered, or deleted while the parent Program is
  in an **editable** status — `DRAFT`, `FOR_REVISION`, or `PUBLISHED_REVISION`.
  Every guard in `ProjectActivitiesService` uses `isEditableStatus`, delete
  included: dropping a PPA from an open revision is a working-copy edit, and the
  public keeps seeing the published snapshot until someone republishes.
- Otherwise the whole PA/line-item tree is locked. A `PUBLISHED` program has to
  have a revision opened (`POST /programs/:id/revise`) first; a submitted one
  waits for a return-for-revision.
- **`DELETABLE_PROGRAM_STATUSES` is not the gate here.** That narrower set
  (`DRAFT`, `FOR_REVISION`) exists so a whole published *program* can never be
  deleted. Clients that reused it for PPA delete greyed out the button for an
  action the API accepts — see `client/src/lib/program-status.ts`.

Unlike Programs, PAs are **hard-deleted** (no soft delete); deleting a PA
cascades to its line items.

## Rollups

Creating, updating, or deleting a PA runs inside a transaction that recomputes
the parent Program's denormalised totals via [`BudgetRollupService`](budget-rollup.md).

## Derived parents (`costMode = ACTIVITY_CHILDREN`)

Such a project owns no figures of its own — three things are computed from its
child activities by [`EstimateRollupService`](budget-rollup.md#phase-1-cost-estimates):
`psEstimate` / `mooeEstimate` / `coEstimate`, `proposedBudget`, and
**`fundSources`** (a union, not a sum).

Because they are derived, the API refuses to be told them:

| Request | Behaviour |
|---|---|
| `POST` with `costMode: ACTIVITY_CHILDREN` and a non-empty `fundSources` | `400` — send `[]` |
| `POST` with any other `costMode` and an empty `fundSources` | `400` — at least one fund |
| `PATCH` on a derived PA carrying `fundSources` (or any estimate) | `400` |
| `PATCH` on any other PA with `fundSources: []` | `400` |

`fundSources` therefore has no `@ArrayMinSize(1)` on `CreateProjectActivityDto`:
the rule depends on `costMode`, and a `ValidateIf` there would switch off the
enum and uniqueness checks along with it. The service enforces it instead.

## Split by fund (`fundAllocations`)

A `DIRECT_COSTS` PA may state what each fund pays instead of one total:
`fundAllocations: [{ fundSource, ps, mooe, co }, …]` on `POST`/`PATCH`, one line
per fund. When sent, the lines replace the PA's split and the rollup derives
`psEstimate`/`mooeEstimate`/`coEstimate`, `proposedBudget` and `fundSources` from
them; `[]` returns the PA to one total (its figures stay). A derived parent
rejects a non-empty list (`400`), and a fund named twice is a `400`. The edit is
audited as `ESTIMATE_UPDATED` ("split by fund (GF, SHF)"). See
[`aip-reference.md` invariant 21](../../api/docs/aip-reference.md).

A child's `fundSources` edit triggers the same rollup cascade as an estimate
edit, so the parent's union stays current. Derived parents created before this
rule still hold hand-entered funds; they are corrected on the next child change,
or immediately via `POST /admin/recompute-rollups/:programId`.

## Services

- **`ProjectActivitiesService`** — CRUD with transactional rollup updates, plus
  the tentative AIP code resync (see below).

## Ordering and AIP codes

`orderIndex` is the user-controlled rank within a sibling group
(`programId` + `parentProjectActivityId`), with `createdAt` as the tie-breaker.
The trailing AIP code segment is **derived** from that rank, so ordering and
codes are the same concern:

- **Create** writes a `~{uuid}` placeholder, then
  `resyncTentativePACodes(programId, tx)` fills in the real code — a rank cannot
  be computed before the row exists.
- **Delete** resyncs, closing the gap the removed row left.
- **Reorder** writes 1-based `orderIndex` in payload order, then resyncs, and
  returns the group with its new codes.

The reorder payload must list **every** sibling under that parent exactly once
(`parentProjectActivityId: null` = the program's root level). Partial lists are
rejected: omitted rows would keep stale ranks and then jump on the next unrelated
resync, which reads as corruption. See [aip-codes](aip-codes.md).

## DTOs

`CreateProjectActivityDto`, `UpdateProjectActivityDto`,
**`ReorderProjectActivitiesDto`**.

## Tables touched

`ProjectActivity`, `LineItem`, `ClimateChangeTag`, `Program`.

## Dependencies

[`budget-rollup`](budget-rollup.md), [`aip-codes`](aip-codes.md),
`PrismaService`.

## Related

- [line-items.md](line-items.md) — the budget lines a PA holds
- [climate-tags.md](climate-tags.md) — the optional climate tag
- [programs.md](programs.md) — the parent
