# Tentative AIP code rework — derived, reorderable codes

**Status:** shipped (Phases 0–4). Open item — program reorder UI — is in the root `PROGRESS.md`.

---

## 1. Why

Three user-visible defects, one root cause.

| Symptom | Today |
|---|---|
| DBM office labels and codes are wrong (PSO should be `OTHERS`, not `OPTIONAL`) | The 47-row catalog is seeded from `api/prisma/data/dbm-offices.json`; the control panel can edit name/type but **not** `code`, and cannot reorder |
| Changing an office's code/type doesn't update PPA codes | The code is a **frozen string** written once at create time |
| Deleting a PPA leaves a permanent gap in the sequence | The ordinal comes from `AIPCodeCounter`, a **monotonic counter that only goes up** |

**Root cause:** `tentativeAipReferenceCode` is materialised from a counter at create time and never reconciled. Every segment of it can change afterwards, and nothing recomputes it.

```
3000 - 000 - 2 - 1 - 011 - 001 - 000
  │     │    │   │    │     │     └── PA ordinal      ← changes on PA delete/reorder
  │     │    │   │    │     └──────── program ordinal ← changes on program delete/reorder
  │     │    │   │    └────────────── DBMOffice.code  ← changes on office edit/reorder
  │     │    │   └─────────────────── officeType digit← changes on office edit
  │     │    └─────────────────────── LGU level (always 2, city)
  │     └──────────────────────────── papSubsectorCode
  └────────────────────────────────── PAPSector.code  ← changes on program edit (BUG: not reissued today)
```

Five of seven segments are mutable. The counter models none of that.

---

## 2. Decisions taken

From the requirements pass:

1. **DBM office table becomes editable + reorderable.** Inline-editable codes *and* drag handles, one Save for the whole table. Duplicates flag live (naming the conflicting office) but don't block mid-pass; Save is disabled while any duplicate remains.
2. **Recompute scope:** programs in an **OPEN** cycle with **no final code**. Closed cycle or `APPROVED` → frozen. Published-but-unapproved → recomputed.
3. **Deletes renumber**, shifting every unapproved sibling to close the gap.
4. **PPAs are drag-reorderable** at three levels: programs within their scope, project/activities within a program, activities within a project.
5. **No new drawer.** Reordering for levels 2–3 lives in the existing `SubItemsSummary` children preview, already shared by both overview drawers.
6. **`papSectorId` changes reissue the code** (fixes an existing bug — only `officeId` triggers a reissue today).
7. **Approval / final-code scenarios are parked.** This phase assumes nothing is approved yet.

### The frozen-code collision (decided: skip-over)

The frozen-code collision: `tentativeAipReferenceCode` is `@unique`, so "approved keeps its code while unapproved renumbers" can collide on write. Resolutions considered — **skip-over** (reserve approved ordinals, leave gaps), **compact** (renumber approved too), **freeze the scope**.

Phase 1 shipped skip-over as a safe default: the alternative was a code path that throws a unique violation and aborts the transaction the first time anything is approved. `resyncTentativeProgramCodes` reserves the ordinals held by frozen rows and steps movable rows over them.

**Decided 2026-10-16 ((issue 85 of the first deployment)): skip-over is the policy.**

- **Nothing in an open cycle is frozen under the publish model.** `APPROVED` is reachable only through the archived approval workflow and the AB 2026 seed (whose cycle is `LOCKED`), and a cycle only moves `PLANNING → OPEN → CLOSED → LOCKED`, so leaving `OPEN` freezes every program in it at once. The reservation loop does not fire today, and skip-over and freeze-the-scope behave identically.
- **Final codes never meet this.** `aipReferenceCode` is a separate column with its own unique index, counter-issued at first publish and never reassigned. Every view reads `aipReferenceCode ?? tentativeAipReferenceCode`, so renumbering a published program's tentative code changes nothing anyone sees. A gap can only show on a never-published draft, in the staff app.
- **Compact is ruled out.** Freezing exists so that a code in a closed or approved cycle stays that code.
- **Revisit only if** the replacement approval workflow freezes single programs inside an open cycle *and* shows tentative codes publicly. Swapping the policy is still a change to one loop.

---

## 3. What already exists (and shrinks the work)

- **`ProjectActivity.orderIndex Int @default(0)`** — already in the schema, already writable via `UpdateProjectActivityDto`, and already the sort key in `aip-cycles.service.ts:252`, `aip-registry.service.ts:155`, `aip-registry-export.service.ts:1130`, `program-diff.service.ts:50`. **PA and activity ordering is already modelled.** Only a batch-reorder endpoint and the UI are missing.
- **`SubItemsSummary`** — exported from `program-overview-drawer.tsx:518`, imported by `project-activity-overview-drawer.tsx:55`. One component already renders both levels of children preview. Adding reorder there covers levels 2 and 3 in one place.
- **`Program`** has **no** order column — the one genuinely new field.

---

## 4. Design: derive the ordinal, delete the counter

Replace "issue once from a counter" with "rank among live siblings".

```
ordinal(program) = 1 + count of live sibling programs in the same
                   (aipCycleId, officeId, papSectorId)
                   ordered by (orderIndex, createdAt) that sort before it
```

Every requirement then falls out of one function instead of five special cases:

| Event | Handled by |
|---|---|
| Program deleted | siblings re-ranked → gap closes |
| Program dragged | `orderIndex` changes → ranks change |
| Office code/type edited | segment changes → codes rewritten |
| `papSectorId` changed | scope changes → re-ranked in both old and new scope |
| Program created | appended at the end |

### Storage

`tentativeAipReferenceCode` **stays a stored column** — 40+ read sites depend on it (registry search `contains`, exports, public views, `orderBy`), and it's `@unique`. But it becomes **derived state written by one resync function**, not a value issued at create time.

```
resyncTentativeCodes(scope, tx)
  ├─ load live siblings in scope, ordered by (orderIndex, createdAt)
  ├─ recompute each code from current segments + rank
  ├─ skip programs that are APPROVED or in a CLOSED cycle
  └─ write only rows whose code actually changed
```

**Unique-constraint ordering hazard:** renumbering `002→001, 003→002` collides mid-update. Write in a single transaction using a two-pass swap (park changed rows on a temporary sentinel prefix, then write finals) or defer the constraint. This is the single sharpest implementation detail.

`AIPCodeCounter` rows for `:tentative` scope keys become dead. The table stays (the `:final` phase still uses it) and `issueTentativeProgramCode` / `issueTentativePACode` / `peek` are deleted — two mechanisms for the same value is how the next reader ends up guessing which one is authoritative. Creates write a `~{uuid}` placeholder and let the resync derive the real code in the same transaction.

---

## 5. Phases

Each phase is one commit.

### Phase 1 — Derived codes (backend, no UI change)
- Add `Program.orderIndex Int @default(0)` + migration; index `(aipCycleId, officeId, papSectorId, orderIndex)`.
- Add `resyncTentativeCodes(scope, tx)` to `AIPCodesService`; two-pass write to dodge the unique constraint.
- Call it from: program create, program soft-delete (`programs.service.ts:771`), program update when `officeId` **or `papSectorId`** changes (`:679` — fixes the sector bug), PA create (`project-activities.service.ts:254`), PA delete (`:504`).
- Backfill `orderIndex` from current code ordinal so existing codes don't churn on first deploy.
- **Check:** unit spec — create 4 programs, delete #2, assert remaining codes are `001..003` with no gap; change `papSectorId`, assert first segment follows.

### Phase 2 — DBM office table (control panel)
- Make `code` editable; add drag handles; batch-save the whole table in one transaction.
- Live duplicate detection naming the conflicting office; Save disabled while duplicates exist.
- On save, resync every affected scope and report the count before committing.
- Endpoint: `PATCH /reference/dbm-offices/reorder` taking the full ordered list.
- **Check:** spec — reorder two offices, assert affected programs' `officeCode` segment updates and unaffected scopes are untouched.

### Phase 3 — PPA reordering UI
- `PATCH /programs/reorder` and `PATCH /project-activities/reorder` — batch `{id, orderIndex}[]`, resync after.
- Add drag handles + typed-ordinal fallback to `SubItemsSummary` (covers program→PAs and project→activities).
- Programs reorder inline in the master list, grouped by their code scope so the boundary is visible.
- **Check:** spec — reorder PAs, assert trailing code segment follows `orderIndex`.

### Phase 4 — Docs
- `api/docs/aip-reference.md` §7 (code is derived, not counter-issued), §6 invariant 13 (now covers `papSectorId`).
- `docs/modules/aip-codes.md`, `docs/modules/programs.md`, `docs/architecture/data-model.md`.

---

## 6. Reorder container: PAP sector

**Decided.** Programs reorder within **PAP sector** — the same scope that owns the counter, `(cycle, office, papSector)`.

`Cluster` is deliberately *not* the container: it reaches a program only indirectly via `Office.clusterId` and is not a segment of the code, so dragging within a cluster that spans two sectors would reorder rows without moving any code. The master list is grouped by sector while in reorder mode so the boundary is visible rather than enforced by rejection.
