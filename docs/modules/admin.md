# Module: `admin`

**Folder:** `api/src/admin/`

## Purpose

Operational and moderation tooling for admins. Two areas:

1. **Public-feedback moderation** (HEAD + SUPER_ADMIN) — review queues for the
   anonymous feedback collected by the [`public`](public.md) module, plus the
   unreviewed-count badge the nav uses.
2. **Rollup repair** (SUPER_ADMIN only) — force-rebuild denormalised budget
   totals if they ever drift out of sync with line-item state.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/admin/registry-feedback` | HEAD, SUPER_ADMIN, STAFF | List general registry feedback (filter `category`, `reviewed`, `deleted`; paginated) |
| PATCH | `/admin/registry-feedback/:id/review` | HEAD, SUPER_ADMIN | Mark a registry feedback submission reviewed (optional `internalNote`) |
| DELETE | `/admin/registry-feedback/:id` | SUPER_ADMIN | Soft-delete a registry feedback submission (restorable) |
| PATCH | `/admin/registry-feedback/:id/restore` | SUPER_ADMIN | Restore a soft-deleted registry feedback submission |
| GET | `/admin/program-feedback` | HEAD, SUPER_ADMIN | List root `PUBLIC_FEEDBACK` program comments with program name (filter `reviewed`, `deleted`; paginated). A HEAD sees only feedback on offices in their scope |
| PATCH | `/admin/program-feedback/:id/review` | HEAD, SUPER_ADMIN | Mark a program feedback thread reviewed (optional `internalNote`); 403 for a HEAD outside its office |
| GET | `/admin/feedback-count` | HEAD, SUPER_ADMIN | Unreviewed counts `{ general, program, total }` for the nav badge (excludes soft-deleted) |
| POST | `/admin/recompute-rollups/:programId` | SUPER_ADMIN | Force-rebuild the program's PS/MOOE/CO/grand totals |

## Feedback moderation

The two feedback feeds are stored differently and reviewed through parallel
endpoints:

- **General registry feedback** → `PublicRegistryFeedback` rows. "Reviewed"
  means `reviewedAt`/`reviewedById` are set; the optional `internalNote` is
  stored on the row. `reviewed=true` returns the reviewed set; otherwise the
  unreviewed set is returned.
- **Program feedback** → root `ProgramComment(stage=PUBLIC_FEEDBACK,
  parentCommentId=null)` rows. "Reviewed" reuses the comment's
  `resolvedAt`/`resolvedByUserId`/`resolveNote` columns. The review endpoint
  rejects non-`PUBLIC_FEEDBACK` comments and non-root threads. Because
  `ProgramComment` has no Prisma relation to its resolver, the resolver name is
  batch-fetched separately and merged into the response.

`GET /admin/feedback-count` powers the unreviewed badge in the control-panel
nav; the matching admin UI lives at
`client/src/app/control-panel/registry-feedback/`.

### Soft delete

Feedback removal is **non-destructive**. SUPER_ADMIN deletes set a `deletedAt`
timestamp (plus `deletedById` / `deletedByUserId` for audit) instead of dropping
the row, mirroring the `Program.deletedAt` convention. Every read path filters
`deletedAt: null`, so deleted feedback disappears from public pages, the LGU
dashboard, admin lists, and all counts. Passing `deleted=true` to the list
endpoints returns only the soft-deleted set (the moderator "trash" view), and the
restore endpoints clear `deletedAt`. Deleting a program comment cascades to its
reply subtree; restoring the comment brings the subtree back. General feedback
delete/restore live on the admin controller; program feedback reuses
`DELETE`/`PATCH /comments/:id(/restore)` from the comments module.

**Who sees the trash:** the `deleted=true` view is **admin-only** (HEAD +
SUPER_ADMIN). On `GET /admin/registry-feedback` — which STAFF may otherwise call
for live feedback — a `deleted=true` request from a non-admin is rejected with
403, so removed content can't be retrieved via a direct API call. **Delete and
restore remain SUPER_ADMIN-only**; HEAD admins get a read-only trash view.

## Rollup repair

### When you would use it

`Program` and `ProjectActivity` totals are denormalised caches kept correct by
[`BudgetRollupService`](budget-rollup.md) running inside every line-item
transaction. They can only drift if something writes the database **outside**
the services — e.g. a manual SQL fix or a data migration.

This endpoint calls `forceRecomputeProgram`, which rebuilds the whole tree
(line items → PA totals → program totals) from scratch, restoring correctness.
It is a repair tool, not part of any normal flow.

> A scheduled drift-detection job is intentionally out of MVP scope — see
> [`api/docs/aip-reference.md` §12](../../api/docs/aip-reference.md). For now,
> recompute is manual.

## Dependencies

[`budget-rollup`](budget-rollup.md) (`forceRecomputeProgram`), `PrismaService`.

## Related

- [public.md](public.md) — collects the feedback this module moderates
- [comments.md](comments.md) — the `ProgramComment` / `PUBLIC_FEEDBACK` model
- [budget-rollup.md](budget-rollup.md) — the recompute logic
