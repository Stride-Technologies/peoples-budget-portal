# Module: `thematic-tags`

**Folder:** `api/src/thematic-tags/`

## Purpose

An open, extensible catalog of beneficiary categories (PWD, Senior Citizens,
Youth, Women, Children, LGBTQIA+, and anything created since) that a Program
and any of its Project/Activities can each carry **any number of**,
independently — unlike `climate-tags`, which is one tag per owner. A PA always
displays the union of its own tags and its parent Program's current tags
("effective tags"), computed on every read and never stored.

```
Program ──0..n── ProgramThematicTag ──n..1── ThematicTag
   │                                              │
   └─ ProjectActivity ──0..n── ProjectActivityThematicTag ──n..1──┘

Effective PA tags = ProjectActivityThematicTag(paId) ∪ ProgramThematicTag(pa.programId)
```

Full design: `specs/006-thematic-tags/` (spec, plan, research, data-model,
contracts).

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/thematic-tags` | `aip:read` | Search the catalog (`search`, `activeOnly`, default `true`) |
| POST | `/thematic-tags` | `aip:tag` | Find-or-create by normalized name; 409s with `{ closeMatch }` on a near-miss unless `confirmNew` |
| GET | `/thematic-tags/all` | `reference:read` + `SUPER_ADMIN` | Every tag, active and inactive, with `usageCount` |
| PATCH | `/thematic-tags/:id` | `reference:write` + `SUPER_ADMIN` | Rename and/or set `isActive` |
| POST / DELETE | `/programs/:id/thematic-tags` | `aip:tag` | Apply/remove a tag directly on a Program (idempotent) |
| POST / DELETE | `/project-activities/:id/thematic-tags` | `aip:tag` | Apply/remove directly on a PA; DELETE 400s if the tag is only present via inheritance |
| GET | `/public/thematic-tags` | public | Active tags only, for the registry filter |
| GET | `/public/registry` | public | Gains `thematicTagId` (array, AND across tags) and tag-name `search` matching — a tag matches a program directly or through any of its PAs (supersedes FR-017's program-only scope) |

## RBAC

`aip:tag` is a new, narrow permission key — not a reuse of `aip:write`. It
gates every write endpoint above and is granted to every template that already
carries `aip:write` (CPDO Head, CPDO Secretariat, Intern / Authorized Encoder)
**and** to `NCPC`, which does not carry `aip:write`. `assertCanTag`
(`programs.service.ts`) is the service-layer check: the owning office (via
`assertOwner`) **or** any NCPC user regardless of office — deliberately
symmetric (either side may remove a tag the other applied).

Tagging is gated by `isEditableStatus` the same as every other program
mutation — no exception for any role, including `SUPER_ADMIN`. A locked cycle
can never be retagged.

## Catalog rules

- `ThematicTag.normalizedName` (`name.trim().toLowerCase()`) is `@unique` —
  the actual dedup guarantee (FR-007), not just the picker's search.
- A near-miss (edit distance ≤1–2 relative to the shorter label) is flagged as
  a `closeMatch` 409 rather than silently creating a near-duplicate; the
  caller resubmits with `confirmNew: true` to create one anyway.
- Deactivating a tag (`isActive: false`) only hides it from future search —
  every existing `ProgramThematicTag`/`ProjectActivityThematicTag` row keeps
  resolving its name via FK, so nothing already tagged changes.
- No merge tool (deferred — see spec.md User Story 6).

## Public visibility

Published Programs and PAs show their current tags as badges, including a
PA's inherited ones (indistinguishable from direct ones on the public view —
only the staff editor shows a lock icon). The registry's `thematicTagId`
filter matches a Program's own direct tags only, never through a child PA.

Tags are read **live**, not from the `ProgramVersion` snapshot (unlike
name/money) — on a `PUBLISHED_REVISION`, a tag change made mid-draft is
visible on the public page before the next republish. This is a known,
deliberate simplification; a snapshot-and-restore pass (mirroring
`ProgramVersionsService`) is a documented follow-up if that drift ever
matters in practice.

## Known client gaps

- The `SUPER_ADMIN` catalog screen (rename/deactivate, `GET /thematic-tags/all`
  + `PATCH /thematic-tags/:id`) has no control-panel page yet, unlike
  `climate-typology-codes`.

## Tables touched

`ThematicTag`, `ProgramThematicTag`, `ProjectActivityThematicTag`, `Program`,
`ProjectActivity`, `ProgramAuditLog` (`TAG_ADDED` / `TAG_REMOVED`).

## Related

- [climate-tags.md](climate-tags.md) — the one-tag-per-owner sibling this
  deliberately does not copy the shape of
- [programs.md](programs.md), [project-activities.md](project-activities.md)
- [public.md](public.md)
