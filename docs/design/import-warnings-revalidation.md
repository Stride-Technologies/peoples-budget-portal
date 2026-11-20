# Import warnings: derive what can be derived

## The bug

`Program.importWarnings` is written **once**, by `prisma/seed-aip-2027.ts` inside a
`tx.program.create`. Nothing in `api/src` ever writes it; no repair script touches it.

It drives the `INCOMPLETE_IMPORT` publish blocker, so **145 of the 225 seeded 2027 programs cannot
be published** — individually with a `BadRequestException`, and in batch publish they are *silently
skipped*.

Because the array is stored and never recomputed, **fixing the data changes nothing**:

```
office fills in the missing amount
        │
        ▼
  proposedBudget = 250000        ← data is now correct
        │
        ▼
  import_warnings still says
  "3 of 12 PPAs have no proposed amount in the workbook."
        │
        ▼
  INCOMPLETE_IMPORT ──► publish blocked, forever
```

The schema comment promised "Cleared deliberately once the office has settled the data". No code
path performed that. Direct SQL was the only way out.

## The split

Ten warning kinds were conflated in one array. They are not the same kind of thing:

| Kind | Count | Re-derivable? |
|---|---|---|
| no proposed amount / no dates / no expected output / no funding source / no PPA rows | 110 | yes |
| no AIP form section (`papClass` null) | 3 | yes |
| PS+MOOE+CO ≠ stated total | 5 | yes |
| finish line inferred from the implementing office | 99 | **no** |
| workbook listed the program twice, PPAs merged | 1 | **no** |
| synthetic program holding orphan PPAs, needs a proper name | 1 | **no** |

A gap in the data can be re-checked against the data. An **inferred finish line cannot** — once
stored, the guess is indistinguishable from a deliberate choice. That asymmetry is the whole design.

```
                      ┌─────────────────────────────────────┐
   derived (7 kinds)   │ deriveDataWarnings(papClass,leaves) │
   recomputed every    │  import-data-warnings.ts            │
   read, self-healing  └──────────────┬──────────────────────┘
                                      ▼
                          readiness.warnings[]   ← advisory, joins ceilings
                                      ▲
                      ┌───────────────┴──────────────┐
   provenance (3)     │ Program.importWarnings[]     │
   stored, cleared    │  → INCOMPLETE_IMPORT blocker │
   by explicit review │  → POST :id/acknowledge-import│
                      └──────────────────────────────┘
```

This mirrors the `INCOMPLETE_DATA` blocker that already sits in `readinessFor`, whose comment reads
*"Derived, so filling one in the UI clears the blocker with no extra bookkeeping."* The stored
sentences were a frozen duplicate of checks the service was already doing live.

## Decisions

- Derived warnings keep their **specific sentences**, recomputed live — not a bare
  `INCOMPLETE_DATA` label.
- Sentences are **present tense**. The import report says "…in the workbook" because it describes a
  frozen spreadsheet; these describe the row as it stands now.
- The derived amount check uses the **same predicate as `ZERO_PROPOSED_BUDGET`** (`<= 0`, so an
  explicit ₱0 counts as missing) so the sentence and the blocker can never disagree.
- Derived sentences go into the existing advisory `warnings[]`, not a new field. No client type
  change, and they render in both the publish panel and the batch dialog for free.
- Provenance warnings clear **only** via an explicit "Mark import reviewed" action — no
  field-edit-triggered clearing.
- The two genuinely new checks (`papClass`, arithmetic) are **advisory**: they add no blocker.
- `blockers` is untouched. `NO_PPAS` / `ZERO_PROPOSED_BUDGET` / `INCOMPLETE_DATA` gate exactly as
  before; the derived sentences only explain them.

## Not doing

**No recompute hook in the ~20 PPA mutation paths.** Deriving at read time in `readinessFor` gets
the same result with no transaction plumbing and no drift risk, and `readinessFor` already loads
almost every field the checks need.

**No shared module with the importer.** `db:import:2027` runs under `ts-node` with
`tsconfig.seed.json` (CommonJS resolution); `seed-aip-2027.ts` documents that this is precisely why
*it* runs under `tsx` instead — a CommonJS resolver cannot follow the `.js` specifiers in
`api/src/`. Migrating the importer to tsx to share one module would be an unverifiable change,
because the workbook is gitignored and the importer cannot be run without it. The importer keeps its
own past-tense report sentences; only `isProvenanceWarning` is shared, and only with the seed.

## Bonus fix

`batch-publish-dialog.tsx` rendered `blockers` and `warnings` but never `importWarnings`, so a
skipped program showed a one-line label and no reasons. Routing derived sentences through
`warnings` makes them appear there.

## Files

| File | Change |
|---|---|
| `api/src/programs/import-data-warnings.ts` | new — `deriveDataWarnings`, `isProvenanceWarning` |
| `api/src/programs/program-publish.service.ts` | derive in `readinessFor`; new `acknowledgeImport` |
| `api/src/programs/programs.controller.ts` | `POST :id/acknowledge-import`, `aip:publish` |
| `api/prisma/schema.prisma` | `IMPORT_REVIEWED` audit action; field doc comment |
| `api/prisma/migrations/…_prune_derived_import_warnings/` | enum value + strip the 145 rows |
| `api/prisma/audit-import-warnings.ts` | new — read-only before/after tally |
| `api/prisma/import-aip-2027-xlsx.ts` | derived warnings feed the report, not `importWarnings` |
| `api/prisma/seed-aip-2027.ts` | filter through `isProvenanceWarning` |
| `client/src/components/aip/publish-panel.tsx` | Mark-reviewed button + recut copy |
| `client/src/lib/api.ts` | `acknowledgeImport` wrapper |

Status: shipped (migration `20260806000001`). Open follow-ups live in the root `PROGRESS.md`.

## Follow-up (2026-08-17): the gaps go back on the registry row

The split above worked, and produced a side effect nobody had priced. Derived
sentences reach `readinessFor` only, so they surface **inside** a program. From the
registry list, the 50 programs whose warnings were entirely derived simply went
quiet — the migration looked, from the outside, like someone had reviewed them.
Nobody had: `program_audit_logs` held **zero** `IMPORT_REVIEWED` rows.

So the registry row now carries `dataWarnings` beside `importWarnings`, and one
amber marker covers both with a two-heading tooltip. The original argument against
this — *"putting them on the row would mark half the registry"* — was never measured.
Measured, it lands on one cycle:

| cycle | marked before | marked after | new |
|---|---|---|---|
| 2026 | 434 | 434 | **0** — every AB 2026 row already carries an import decision |
| 2027 | 94 | 155 | 61 |

Deliberate consequence: *Mark import reviewed* no longer always clears the marker.
It clears the import decisions; if the row still has gaps, the triangle stays, and the
tooltip's two headings are what say why.

`leavesOf` moved into `import-data-warnings.ts` for this — `readinessFor` and the
registry both need the same leaf set, and two copies of that five-line `Set` is
exactly the drift the derivation exists to prevent. It also let
`EMPTY_PARENT_PPA` drop its parallel `parentIds` lookup and read as what it is:
a cost-derived leaf.

Also fixed here: `IMPORT_REVIEWED` was absent from the Edit History tab's filter
list and colour map, and `formatValue` rendered its `string[]` diff comma-jammed
with a blank "to" cell — so the one action that records an import review was the
hardest entry in the tab to find or read.
