# Module: `budget-ceilings`

**Folder:** `api/src/budget-ceilings/`

## Purpose

Manages `FinishLineBudgetCeiling` rows — the per-cycle, per-finish-line budget
allocation. Each ceiling's single `totalCeiling` is the cap the program approval
check enforces. (The legacy LGU/CSO hard-partition was retired with the NCPC
proponent track — endorser pivot Phase 3.)

## Endpoints

Routes are mounted under `/finish-line-ceilings`.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/finish-line-ceilings` | Authenticated | List ceilings, optionally filtered by `cycleId` |
| GET | `/finish-line-ceilings/:id` | Authenticated | Get one ceiling with recent history |
| POST | `/finish-line-ceilings` | SUPER_ADMIN | Create a ceiling for a `PLANNING` or `OPEN` cycle + finish line |
| PATCH | `/finish-line-ceilings/:id` | SUPER_ADMIN | Update a ceiling while the cycle is `PLANNING` or `OPEN` (prior state appended to history) |
| DELETE | `/finish-line-ceilings/:id` | SUPER_ADMIN | Delete a ceiling (cycle must be `PLANNING`, no programs referencing it) |

## The cap

Each ceiling's single `totalCeiling` is the cap. In Phase 1 it is **advisory**:
`ProgramPublishService.ceilingWarnings` sums the `proposedTotal` of every
published program in the same `(cycle, finishLine)`, adds the program being
published, and returns a warning — not a blocker — when the result exceeds
`totalCeiling`. (The old hard gate at final approval was removed with D18.)

### Zero is a real ceiling

`totalCeiling = 0.00` is valid and means **"nothing goes here this cycle"** — it
is not the same as having no ceiling row. Only the *absence* of a row means "no
ceiling set":

| State | Publish warning | Finish-lines tracker |
|---|---|---|
| No row | none (silently skipped) | "No ceiling set" |
| `0.00` | warns on any positive proposal | ₱0 cap, "Over ceiling" once anything is allocated |
| `> 0` | warns above the cap | percentage against the cap |

Anything deciding "is a ceiling configured?" must test for the row, never for
`totalCeiling > 0`. Percentage math still guards `> 0` to avoid dividing by zero.

> The legacy LGU/CSO ceiling split (`csoSplitType` / `csoSplitValue` columns and
> the `CSOSplitType` enum) was dropped with the NCPC proponent track — there is
> no partition; the whole `totalCeiling` is the cap.

## History

Every update appends the prior state to `FinishLineBudgetCeilingHistory` — an
append-only audit trail. Updates are allowed while the owning cycle is
`PLANNING` or `OPEN`, and the current ceiling values apply immediately to later
approval checks. The detail endpoint returns recent history alongside the
current ceiling and enriches each row with the changer's user name when the
user still exists.

## Services

- **`BudgetCeilingsService`** — CRUD, history capture, and total validation
  (`validateTotal` — the ceiling is a single non-negative `totalCeiling`; zero
  passes, only negatives are rejected).

## DTOs

`CreateBudgetCeilingDto`, `UpdateBudgetCeilingDto` (decimal fields arrive as
strings).

## Tables touched

`FinishLineBudgetCeiling`, `FinishLineBudgetCeilingHistory`, `AIPCycle`,
`FinishLine`, `Program` (delete guard).

## Dependencies

`PrismaService`.

## Related

- [aip-cycles.md](aip-cycles.md) — a cycle needs ≥1 ceiling to open
- [programs.md](programs.md) — the approval-time ceiling check
- [architecture/workflow.md](../architecture/workflow.md#budget-ceiling-enforcement)
