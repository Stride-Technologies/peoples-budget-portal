# Module — `program-audit`

The **edit history**: an append-only record of who changed what on a program,
when, and on whose behalf.

> Not to be confused with version history. Two different questions, two
> mechanisms, two UI surfaces — see [§Versions vs history](#versions-vs-history).

Introduced in Phase 1 (D9).

---

## Why it exists

Phase 1 has a small set of CPDO encoders entering **every office's** AIP on their
behalf. The question "who actually put this figure in?" therefore has no answer
in the data model unless something records it: the program belongs to CAgO, but
the person who typed it works for CPDO.

`ProgramAuditLog.onBehalfOfOfficeId` is that answer. It stores the **proponent
office**, not the actor's home office, which is what makes an encoder's work
attributable to the office whose budget it is.

## Versions vs history

| | Version history (`ProgramVersion`) | Edit history (`ProgramAuditLog`) |
|---|---|---|
| Question | "What did this AIP look like at v3?" | "Who changed what, when, and why?" |
| Granularity | One row per publish | One row per action |
| Storage | Full JSON snapshot tree | Actor + action + field diff |
| Surface | Version picker / compare view | History tab on the program **and** each PPA |
| Public? | Yes — snapshots are served publicly | **Never** |
| Immutable | Yes | Yes — append-only |

The edit history is never public. It records *draft* activity, so exposing it
would publish figures that were deliberately discarded — the opposite of the
guarantee the draft/publish split exists to make.

## Files

```
api/src/program-audit/
├── audit-fields.ts               Per-entity allow-lists + diffFields()
├── program-audit-log.service.ts  record(entry, tx) — the write path
├── program-audit-query.service.ts  Read side: filters, cursor pagination
├── program-diff.service.ts       Working copy vs published snapshot
├── program-audit.controller.ts   edit-history routes (draft-diff is in ProgramsController)
└── program-audit.module.ts       @Global
```

## Write path

```ts
await this.audit.record(
  {
    programId,
    action: ProgramAuditAction.ESTIMATE_UPDATED,
    actor: user,
    onBehalfOfOfficeId: program.officeId, // the proponent office
    targetType: AuditTargetType.PROJECT_ACTIVITY,
    targetId: pa.id,
    summary: `${pa.name}: cost estimate changed`,
    changes,
  },
  tx, // ← the caller's transaction, always
);
```

Three rules the write path enforces:

1. **Transaction-aware, never self-opening.** Same style as
   `BudgetRollupService`. A mutation and its log row commit together or not at
   all — a failed edit must not leave a trail claiming it happened.
2. **An empty diff writes no row.** A `PATCH` that sets a field to the value it
   already holds produces nothing, which is what keeps the history readable.
3. **No update or delete method exists**, for anyone, including `SUPER_ADMIN`.
   Append-only is enforced by the absence of the code path rather than by a
   runtime check a later refactor could soften.

### The allow-list

`audit-fields.ts` holds an explicit field list per entity. Never diff blindly:
new columns would leak in silently, and derived rollups would churn a row on
every recompute. Rollups are excluded deliberately — they move as a
*consequence* of an edit, so logging them double-reports it.

The same allow-list drives `ProgramDiffService`, so the compare view and the
history can never disagree about what counts as a change.

`diffFields` normalizes numerics through `Prisma.Decimal`, not `Number`: money is
`Decimal(18, 2)`, and a naive `toString()` comparison reads
`Decimal('180000.00')` against the wire's `'180000.00'` as a change.

A DTO field that is **`undefined` is not being changed** and is skipped; an
explicit `null` is a clearing edit and is logged. The test is `=== undefined`, not
`in`: `ValidationPipe` hands the service a DTO *instance* whose every declared
field is an own key, so `in` logged every unsent field as cleared to `null` (#82).
A blank string and `null` compare equal.

## Routes

| Route | Permission | Returns |
|---|---|---|
| `GET /programs/:id/edit-history` | `aip:audit` + office in scope | Full stream for the program and every PPA under it. Filters: `action`, `actorUserId`, `targetId`, `since`; cursor-paginated. |
| `GET /project-activities/:id/edit-history` | `aip:audit` + office in scope | Filtered to one PPA — the per-PPA History tab. |
| `GET /admin/edit-history` | `aip:audit`, bounded by office scope | Every program the caller can audit (#89) — **Control Panel → Edit History**. Filters: `officeId`, `programId`, `action`, `actorUserId`, `since`; cursor-paginated. Each item also carries `program { id, name, code, office }`. An `officeId` outside the caller's scope matches nothing. |
| `GET /programs/:id/draft-diff` | `aip:read` + office in scope | Field-level diff of the working copy against the published snapshot. |

Visibility is broad by design (D22): an office head reviewing a figure CPDO
entered on their behalf is precisely who needs the trail. Office scope contains
the blast radius.

## What is not here

- **No churn collapsing.** Eight typo fixes write eight rows. The table is cheap,
  and collapsing would need a read-modify-write on the hot path plus a window
  rule nobody will remember. Noise is a *rendering* problem — group consecutive
  same-actor rows client-side.
- **No retention policy.** Soft-deleting a program or a comment leaves its log
  rows intact. The history has to outlive the thing it describes.

## Related

- `docs/design/phase-1-publish-scope.md` §3.6 — the design
- [`docs/modules/programs.md`](programs.md) — the publish lifecycle that writes into this
- [`docs/modules/comments.md`](comments.md) — comment actions are logged here too
