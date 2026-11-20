# Module: `ppmp`

**Folder:** `api/src/ppmp/`

## Purpose

Lets an office build a **Project** (the product-facing name for a Project
Procurement Management Plan) — pick an office and a **Classification**, and
type the Project's **name** and **funding AIP Program** directly as free
text (`PPMP.name`, `PPMP.fundingProgram`). Both used to be derived from a
required, `@unique` FK to a real `Program` row (specs/005); that link was
removed (see "History of the Program link" below) because it forced every
Project's identity through picking an existing Program row, which didn't
match how offices actually plan — `fundingProgram` is a note on which AIP
Program funds the work, not a structured, validated reference. Every line
item under the Project is a procurement item shaped after the real GPPB
Annex A PPMP form (its own `lineItemName` — the GPPB "name of the project
to be procured" field, independent of the parent Project's name, and
deliberately **not** called `projectName` on the line item — "Project" is
the parent PPMP itself — pre-procurement conference flag, procurement date
range, an **optional, free-text** expected delivery/implementation period,
**optional** type of project, **optional** mode of procurement, UACS
object, quantity/unit cost, fund source, **expense class**, optional
supporting document, remarks).
**Expense Class went required → hidden-with-a-default → removed entirely →
back, required, now positioned next to Fund Source in the form** — the
`ppmp-uacs-object-selector.tsx` picker was changed alongside the *removal*
to browse the whole active catalog grouped by PS/MOOE/CO instead of being
pre-filtered to one class, and that change was **not** reverted when
Expense Class came back — there is no cross-filtering between the two
fields today; picking an Expense Class and a UACS object from a different
class is possible and not validated against each other (a real gap versus
AIP's own `LineItem`, which enforces `uacsObject.expenseClass ===
lineItem.expenseClass` — see `api/docs/aip-reference.md` §invariant 3 — but
not one PPMP has picked up). A server-computed line total and grand total
are displayed to users as
**"Estimated Budget / Authorized Budgetary Allocation (PhP)"**. Every
mutation (rename, line-item add/update/delete/document, `approve`) is
available unconditionally to anyone with `aip:write`/`aip:publish` in scope
for the Project's office — see
`research.md` Decision 5/6 for
why this is deliberate, not a gap. Beyond the Program link, the Project is
**still not** part of AIP's multi-stage workflow (no SUBMITTED/
HEAD_REVIEWED/PENDING_APPROVAL, no committee sequencing) — but it does now
carry a **deliberately simple approval gate**, `PpmpStatus` (`DRAFT` /
`APPROVED` / `REVISION`): every Project starts `DRAFT`; `POST /ppmp/:id/
approve` moves it to `APPROVED`, which is a precondition `PpmpService.publish`
checks alongside the existing "has at least one line item" rule; any
content-mutating action on an `APPROVED` Project (rename, line-item add/
update/delete/document — **not** reorder, which changes display order, not
content) reverts it via `PpmpService.draftRevertPatch`, so an edit after
approval always needs re-approval before it can be (re)published. Where it
reverts *to* depends on whether the Project was live at the moment of the
edit: a never-published `APPROVED` Project reverts to plain `DRAFT`, same as
before `REVISION` existed; an already-`isPublished` `APPROVED` Project
reverts to **`REVISION`** *and* is unpublished in the same patch — the edit
is saved immediately (there is still no draft/snapshot layer, see below),
but the public site stops showing the Project until someone re-approves and
explicitly republishes it. `PpmpService.publish` itself needed no change for
this: it already required `APPROVED` + `!isPublished`, so calling it again
after a `REVISION` Project is re-approved is a genuine "push live again," not
a no-op. The client tells the two publish actions apart by `publishedAt !==
null` (has this Project ever gone live), not by `status`, since `status` is
back to plain `APPROVED` by the time the button is clickable — a "Republish"
label + a distinct `RefreshCw` icon (vs. "Publish" + `Upload`) in both
`ppmp-master-list.tsx` and `ppmp-detail-view.tsx`'s `publishAction`. The
`REVISION` badge is styled violet, distinct from `APPROVED`'s blue and plain
`DRAFT`'s amber, in both the master list and the drawer/page detail headers.
`approvedAt` is stamped alongside every approval and feeds a synthesized
"Project approved" / "Project reverted to draft" / "Project unpublished and
marked for revision" set in the History tab (`ppmp-history.util.ts`'s
`buildPpmpHistory` — the generic "Project unpublished" entry is suppressed
when the more specific revision one already covers the same edit), the same
`updatedAt`-inference pattern used throughout. This is a one-time product
decision, not a stepping stone toward AIP's full chain, nor toward AIP's
`ProgramVersion` snapshot/`PUBLISHED_REVISION` machinery — `REVISION` here
is a status label plus one boolean flip, not a parallel draft-content
system — see `research.md` for
the earlier "no workflow" call this revises and why a lightweight gate (not
the full Program state machine) was chosen both times.

**`PPMP.classification` is a Project-level categorization, required at
creation, modeled on but separate from AIP's `PapClass`** — `PpmpClassification`
(`GENERAL_ADMINISTRATIVE_SERVICES` / `SUPPORT_TO_OPERATIONS` / `OPERATIONS` /
`DIGITALIZATION`) shares its first three labels with `PAP_CLASSES`
(`client/src/lib/schemas.ts`) but is its own enum — `DIGITALIZATION` has no
AIP-code-segment equivalent and this value never feeds the AIP code format
the way `papClass` does on a `Program`. The PPMP Registry table sub-sections
each office group by `classification` the same way `aip-master-list.tsx`
sub-sections a Program group by `papClass` — see Client below.

**Expected Delivery/Implementation Period is one free-text field, not a
date range** — `PPMPLineItem.deliveryPeriod` is a single nullable `String`
column (offices write things like "within 30 days of PO" that don't fit a
month/year picker, and don't naturally split into a start/end pair either —
this went through an intermediate `deliveryStart`/`deliveryEnd` two-field
shape before collapsing to one). Procurement Activity's
`procurementStart/EndMonth/Year` is unrelated and still structured ints with
its own start-before-end `superRefine` — don't conflate the two.

**History of the Program link**: originally unlinked entirely
(specs/001), then linked at the line-item level so two procurement items
could share one AIP code under the same Program (specs/003), then moved up
to the Project level (specs/005) after confirming a Project *is* one
Program's procurement plan, then **removed entirely** — `programId`
(`@unique` FK) and the derived `aipReferenceCode` are gone from `PPMP`;
`name` is now typed directly and `fundingProgram` (free text) replaces the
Program picker. The migration
(`20260818010000_ppmp_unlink_program_add_feedback_fields`) backfills
`fundingProgram` from each existing row's linked Program's AIP reference
code, so Projects created under the old flow keep an identifying value
instead of an empty field. `client/src/components/custom/program-
combobox.tsx` was deleted along with it — nothing else used it.

**Indicative and Final, and optional line links (specs/012 P5).** A Project
is `kind` **INDICATIVE** (every Project made before the year's budget is
enacted) or **FINAL**. `POST /ppmp/:id/create-final` copies an Indicative
Project into a new DRAFT Final one (`sourcePpmpId`, one per Indicative) once the
year's Appropriation Ordinance is ENACTED (409 `ORDINANCE_NOT_ENACTED`,
`FINAL_EXISTS`). Each line may be linked to **one** budget row
(`programId` / `projectActivityId` / `budgetItemId`, DB CHECK
`ppmp_line_items_one_link`): an AIP program or PA of the Project's office and
year while Indicative, an enacted Ordinance PPA once Final. The copy relinks
each AIP link through `ppmp-relink.ts` (the PPA's source link, then via the
LEP, then a reused id); a line with no single match is copied unlinked and
returned in `unmatched`. This does **not** bring back the specs/005 Program
FK: links are per line, optional, and `fundingProgram` free text stays.
Linking is planning metadata, so it does not revert an APPROVED Project.
Discarding an AIP revision rebuilds the program's PAs; `restoreFromSnapshot`
puts back PPMP line links to restored PA ids (ON DELETE SET NULL would
otherwise drop them).

**"New Project" is a drawer, not a page** — `new-project-drawer.tsx`
(Sheet, styled after `project-overview-drawer.tsx`'s blue header) replaced
`/ppmp-registry/new`, so creating a Project no longer navigates away from
the registry. On save it chains straight into `ProjectOverviewDrawer` with
`focusAddLineItem` set, same continuation the Plus icon already used.

## Endpoints

**Public pages** are a section like the AIP and Annual Budget
(`client/src/lib/public-sections.ts`, kind `'ppmp'`): `/ppmp/[year]/{overview,browse,methodology}`
under the shared `SectionChrome` masthead, every cycle offered whatever its status,
a plan's own page at `/ppmp/[year]/plan/[id]`. `/ppmp` and `/ppmp/<year>` redirect to
the first visible tab; an old `/ppmp/<uuid>` link redirects to the plan's page. The
Overview (coverage, type of purchase, mode of procurement, start month, offices —
`client/src/lib/ppmp-overview.ts`) is off per year until switched on in the control
panel (`AIPCycle.publicPpmpOverviewEnabled`). It reads every published plan's line
items, one request per plan. Browse has the AIP registry's filters — finish line,
cluster, office, search — plus the summary strip, jump-to-office and grand total,
all client-side over the year's plans (`client/src/lib/ppmp-filter.ts`). **A plan
has no finish line of its own**: the finish-line filter matches through the plan's
office's cluster (`Office.clusterId` → `FinishLineCluster`), and Methodology says so.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/ppmp` | `aip:read` | List Projects, office-scoped; optional `officeId`/`aipCycleId`/`isPublished` filters |
| GET | `/ppmp/:id` | `aip:read` | Get a Project with its ordered line items and computed grand total |
| POST | `/ppmp` | `aip:write` | Create a Project — `officeId`, `aipCycleId`, `classification`, `name`, and `fundingProgram` are all provided directly; nothing is derived |
| PATCH | `/ppmp/:id` | `aip:write` | Update `name`, `fundingProgram`, `officeId`, and/or `classification`; `aipCycleId` is immutable after creation. An `officeId` change is re-validated against the caller's scope on the *new* office (not just the old one) before it's applied |
| DELETE | `/ppmp/:id` | `aip:write` | Hard-delete a Project; cascades to its line items, comments, and feedback |
| POST | `/ppmp/:id/line-items` | `aip:write` | Add a line item; `lineTotal` is always server-computed |
| PATCH | `/ppmp/:id/line-items/:lineItemId` | `aip:write` | Partial update; recomputes `lineTotal` if `quantity`/`unitCost` change |
| DELETE | `/ppmp/:id/line-items/:lineItemId` | `aip:write` | Delete a line item; returns the recomputed `grandTotal` |
| PATCH | `/ppmp/:id/line-items/:lineItemId/link` | `aip:write` | Link a line to one budget row (`programId` / `projectActivityId` while Indicative, `budgetItemId` once Final), or clear it with none |
| GET | `/ppmp/:id/link-options` | `aip:read` | The rows its lines may link to, in reading order with depth |
| GET | `/ppmp/:id/budget-warnings` | `aip:read` | Soft warnings: linked budget rows whose PPMP lines, summed over every PPMP of the same year and kind, exceed the row's budgeted amount (the AIP amount for an Indicative PPMP, the enacted one for a Final). A line counts against its row and every row above it. Derived per read, never stored, never blocking (`ppmp-budget-warnings.ts`) |
| POST | `/ppmp/:id/create-final` | `aip:write` | Make the Final PPMP from an Indicative one; returns `{ ppmp, unmatched }`. 409 `ORDINANCE_NOT_ENACTED` / `FINAL_EXISTS` |
| POST | `/ppmp/:id/line-items/:lineItemId/document` | `aip:write` | Attach (or replace) a line item's supporting document — multipart, PDF/Word/Excel/JPG/PNG, max 10MB |
| PATCH | `/ppmp/:id/line-items/reorder` | `aip:write` | Persist a new manual order; rejects if the id set doesn't exactly match |
| GET | `/ppmp/:id/comments` | `aip:read` | List the internal comment thread, root comments with their replies nested one level |
| POST | `/ppmp/:id/comments` | `aip:write` | Post a comment or a reply (`parentCommentId`); rejects a reply-to-a-reply — one level of nesting only |
| GET | `/ppmp/:id/feedback` | `public_comments:view` | List public feedback submitted about this Project (the submitter's email is never returned) |
| POST | `/ppmp/:id/feedback/:feedbackId/reply` | `public_comments:reply` | Post the one official reply a feedback item gets; 409 if it already has one |
| GET | `/ppmp/:id/history` | `aip:read` | Synthesized activity timeline (created, approved/reverted-to-draft/reverted-to-revision, published/unpublished, line items added/updated), newest first |
| POST | `/ppmp/:id/approve` | `aip:publish` | Move a Project from `DRAFT` or `REVISION` to `APPROVED`; idempotent no-op if already approved. Required before `publish` succeeds |
| POST | `/ppmp/:id/publish` | `aip:publish` | Publish (or, for a Project coming out of `REVISION`, **re**publish) a Project; rejects if it has zero line items or `status !== 'APPROVED'` |
| POST | `/ppmp/:id/unpublish` | `aip:publish` | Unpublish a Project; leaves its data untouched |
| POST | `/ppmp/publish-all` | `aip:publish` | Publish every ready (non-empty, unpublished) Project in scope; skips empty ones |
| GET | `/ppmp/exports/all` | `aip:export` | Excel workbook, one sheet per office, of Projects in scope |
| GET | `/public/ppmp` | none (`@Public()`) | List published Projects for a cycle, optionally one office; includes `feedbackCount` |
| GET | `/public/ppmp/:id` | none (`@Public()`) | A published Project's full detail, including `fundingProgram`; 404 if not published |
| GET | `/public/ppmp/:id/history` | none (`@Public()`) | Same synthesized timeline as the authenticated `/ppmp/:id/history`, gated on `isPublished` instead of office scope; both share `ppmp-history.util.ts`'s `buildPpmpHistory` |
| GET | `/public/ppmp/:id/feedback` | none (`@Public()`) | List public feedback for a published Project — submitter name redacted like `/public/registry/:programId/feedback` |
| POST | `/public/ppmp/:id/feedback` | none (`@Public()`), throttled | Submit feedback about one specific published Project — reCAPTCHA-gated, honeypot-intercepted; optional `category`/`sentiment`, same enums and meaning as Program feedback |

Full request/response shapes:
`contracts/ppmp-api.md`
(CRUD),
`contracts/ppmp-registry-api.md`
(publish/export/public),
`contracts/ppmp-line-item-fields-api.md`
(GPPB-aligned line-item fields, document upload), and
`contracts/api-contract.md`
(Project identity, comments, feedback, history).

## Access control

Reuses the existing `aip:write`/`aip:read` permission keys and
`OfficeScopeService.effectiveOfficeIds()` — the same two mechanisms that
gate `Program` CRUD (`programs.controller.ts`), not a parallel `ppmp:*`
permission pair. Every handler resolves the target office (the `officeId`
on create, or the parent PPMP's `officeId` on every other call) and throws
`ForbiddenException` if it falls outside the caller's effective scope.
`SUPER_ADMIN` / `allOfficesScope` users see and act on every office's PPMPs.

## Service

`PpmpService` handles CRUD, line items, and publish; `PpmpExportService` is
a separate small service for the workbook export (kept apart so the export's
ExcelJS/`excel-style.ts` dependencies don't leak into the write-path service):

- **CRUD** — `create`, `findAll`, `findOne`, `update`, `remove`.
- **Line items** — `addLineItem`, `updateLineItem`, `deleteLineItem`,
  `reorderLineItems`, `attachDocument`.
- **Comments** — `listComments` (root comments with one level of nested
  `replies`), `addComment` (rejects `parentCommentId` pointing at another
  reply — flat, one level only).
- **Feedback** — `listFeedback`, `replyToFeedback` (one official reply per
  feedback item; 409 on a second attempt).
- **History** — `getHistory` synthesizes a timeline from timestamps that
  already exist (`PPMP.createdAt`/`publishedAt`/`updatedAt`,
  `PPMPLineItem.createdAt`/`updatedAt` — a line item counts as "added" if
  the two are within a second of each other, else "updated") rather than a
  stored audit log; no per-field diffing. The synthesis itself lives in
  `ppmp-history.util.ts`'s `buildPpmpHistory` — `getHistory` only adds the
  office-scope authorization around it. `PublicService.getPpmpHistory`
  calls the same function after its own `isPublished` check, so the
  authenticated and public timelines can never drift apart in shape.
- **Approval** — `approve` (`DRAFT` or `REVISION` → `APPROVED`, stamps
  `approvedAt`, idempotent no-op if already `APPROVED`).
- **Publish** — `publish` (rejects zero line items, rejects `status !==
  'APPROVED'`, idempotent no-op if already published — the "already
  published" check runs *before* the approval check, so re-publishing an
  already-published Project never fails on approval state; this same method
  serves both a first-ever publish and a post-`REVISION` republish — nothing
  about the method itself changed, only what the client calls it), `unpublish`,
  `publishAll` (now also filters candidates to `status === 'APPROVED'`;
  `skippedNames` covers both "empty" and "not approved" candidates without
  distinguishing which — returns `{ published, skipped, skippedNames }`).
- **`draftRevertPatch(ppmp)`** — private helper spread into the same
  `pPMP.update` every content-mutating line-item method already issues (for
  `updatedAt`): a no-op unless the Project is currently `APPROVED`; if it's
  `APPROVED` and never published, adds `{ status: 'DRAFT' }` (unchanged
  from before `REVISION` existed); if it's `APPROVED` *and* `isPublished`,
  adds `{ status: 'REVISION', isPublished: false }` in the same patch —
  the edit lands immediately, but the Project drops out of every
  `isPublished: true` query the public endpoints run, so it disappears from
  the public site until re-approved and republished. Wired into `update`
  (rename/office/classification), `addLineItem`, `updateLineItem`,
  `deleteLineItem`, `attachDocument` — **not** `reorderLineItems`, since
  reordering changes display order, not content.
- **`grandTotal(lineItems)`** — private Decimal.js sum, recomputed on every
  read and every write response, never cached or stored as a column.
- **`PpmpExportService.exportAll`** — builds an `ExcelJS.Workbook()` from
  scratch (no template), one worksheet per office with ≥1 matching PPMP,
  reusing `applyCellStyle`/`applyBorder`/`AMOUNT_FORMAT`/`FUND_SOURCE_LABELS`
  from `api/src/aip-registry/excel-style.ts`. Amounts are plain peso
  decimals — **not** million-scaled like the AIP complete export, since PPMP
  totals are too small for that to read sensibly.

`uacsObjectId` resolves against the live `UACSObject` table and snapshots
`uacsCode`/`uacsDescription` onto the line item at write time (same pattern
as `LineItem`), so a later deactivation of a UACS object doesn't retroactively
change what an existing PPMP line item displays.

`attachDocument(ppmpId, lineItemId, file, user)` — office-scope check, then
`StorageService.save(file)` ([`storage`](storage.md) module), then updates
`supportingDocumentUrl`/`supportingDocumentName`. A second upload simply
overwrites both columns with the new file's values — there's no delete-first
step and the old stored object isn't cleaned up (accepted v1 scope cut).

The upload goes browser → Next server action → API, so all three limits must
allow 10 MB: the API's `MAX_DOCUMENT_BYTES`, `serverActions.bodySizeLimit`
(`11mb`, `client/next.config.ts`) and nginx's `client_max_body_size` (`12m`).
The defaults of the last two are 1 MB (#83); `client/src/lib/nginx-routes.test.ts`
checks both. The file picker refuses a file over 10 MB before uploading.

The API hardens the upload itself (#127):

- Multer's `limits.fileSize` stops reading at 10 MB and answers 413, so an
  oversized body is never buffered whole.
- The type comes from the file's leading bytes and its extension together
  (`api/src/ppmp/document-signature.ts`), never from the client's
  `Content-Type`. A renamed `.exe` is refused, and so is a zip that is not a
  Word or Excel file. The stored object gets that detected type.

## DTOs

`CreatePpmpDto` (`officeId`, `aipCycleId`, `name`, `fundingProgram`, and
`classification` — all typed directly, nothing derived), `UpdatePpmpDto`
(`name`, `fundingProgram`, `officeId`, and/or `classification`, all
`@IsOptional()` — `aipCycleId` is immutable after creation), `ListPpmpDto`, `CreatePpmpLineItemDto`,
`UpdatePpmpLineItemDto`,
`ReorderPpmpLineItemsDto`, `CreatePpmpCommentDto` (`content`, optional
`parentCommentId`), `ReplyPpmpFeedbackDto` (`reply`) — money fields
(`quantity`, `unitCost`) are string-typed and validated with the same
`^\d+(\.\d{1,2})?$` pattern as `CreateLineItemDto`; `lineTotal` is never an
accepted input on any line-item DTO. `CreatePpmpLineItemDto` requires
`lineItemName`, `uacsObjectId`, `quantity`, `unit`, `unitCost`, `fundSource`,
`expenseClass`, `preProcurementConferenceRequired`, and the 4 procurement
date-int fields — `typeOfProject`, `modeOfProcurement`, and `deliveryPeriod`
are the only `@IsOptional()` fields; `UpdatePpmpLineItemDto` makes
everything optional the same way. The
document-upload endpoint has no DTO — it's a `FileInterceptor('file')` with a
10 MB multer limit, and the controller checks the file's signature. The public feedback DTO
(`api/src/public/dto/public-ppmp-feedback.dto.ts`) now mirrors the general
`PublicFeedbackDto` exactly, `category`/`sentiment` included — the public
Project Overview embeds the same `PublicFeedbackForm` AIP's public pages
use, so the two need identical fields and enums (`PpmpFeedback.category`/
`sentiment` reuse `ProgramFeedbackCategory`/`ProgramCommentSentiment`, not
new enums).

## Tables touched

`PPMP` (with `isPublished`/`publishedAt`, `status`/`approvedAt` — see
`PpmpStatus` in Purpose above, `name`/`fundingProgram` typed directly,
`classification` a required `PpmpClassification`), `PPMPLineItem`
(`lineItemName`, not `projectName`), `PpmpComment`, `PpmpFeedback` (now
also `category`/`sentiment`). FKs to `Office`, `AIPCycle` (year-tagging
only — see Purpose above) and `UACSObject` (on the line item) — no more FK
to `Program`; see "History of the Program link" in Purpose above.
`onDelete: Cascade` from `PPMPLineItem`/`PpmpComment`/`PpmpFeedback` to
`PPMP`, and from `PpmpComment` replies to their parent comment.

## Key invariants enforced here

- **`lineTotal` is always server-computed** (`quantity.mul(unitCost)` via
  Decimal.js) and recomputed whenever either input changes — never accepted
  from the client (FR-004).
- **A simple approval gate, not a workflow** — `PpmpStatus`
  (`DRAFT`/`APPROVED`/`REVISION`) is the *only* gate on publish beyond "has a
  line item"; there is no submit/reject/committee-sequencing, and every
  write still just needs `aip:write` (`approve`/`publish`/`unpublish` need
  `aip:publish`) in office scope (FR-014, revised by this gate — see
  Purpose above). Publish itself is still a plain boolean flag, not its own
  version-snapshot machine — an edit while `DRAFT`/never-published changes
  what the public page shows immediately (there's nothing published yet to
  protect); an edit to an already-published, `APPROVED` Project instead
  drops `isPublished` to `false` in the same write, so *that* edit does
  **not** reach the public page until someone re-approves and republishes.
  See
  `specs/002-ppmp-registry/research.md`
  Decision 1 for the original "no workflow" call this gate revises.
- **A Project can't be published empty or unapproved** — `publish`/
  `publishAll` reject/skip a Project with zero line items or `status !==
  'APPROVED'`; nothing else gates publish. An edit to an already-`APPROVED`
  Project silently reverts it (`draftRevertPatch`) — to `DRAFT` if it was
  never published, to `REVISION` (and unpublished) if it was — so a
  previously-approved-then-edited Project can't be (re)published without a
  fresh `approve` call.
- **The Project has no relationship to the AIP side at all, structural or
  workflow** — `name` and `fundingProgram` are both typed directly by the
  office, `aipCycleId` only tags the fiscal year, and there is no FK to
  `Program` (FR-015's original "no workflow coupling, no FK" call, restored
  after specs/005's `@unique` FK was tried and reversed — see "History of
  the Program link" in Purpose above).
- **`classification` and `officeId` are required at creation, both
  editable afterward via `PATCH /ppmp/:id`** — the registry table's
  project-level Pencil icon opens `edit-project-drawer.tsx` for exactly
  this (Office/Classification/Name/Funding AIP Program). An `officeId`
  change is re-validated against the caller's scope on the *new* office,
  same two checks `create()` runs, not just the old one — otherwise editing
  could move a Project into an office outside the caller's permitted scope.
  Neither field change is exempt from `draftRevertPatch` — moving office or
  reclassifying an `APPROVED` (and possibly published) Project reverts it
  the same as any other edit.
- **A line item's `typeOfProject`, `modeOfProcurement`, and
  `deliveryPeriod` are genuinely optional; `expenseClass` is required** —
  `PPMPLineItem.typeOfProject`/`modeOfProcurement` are nullable columns, but
  `expenseClass` is not (`NOT NULL`, no server-side default — the client
  form defaults its own field to `MOOE`, the DB column keeps a `MOOE`
  default only as a migration safety net for any pre-existing rows, same
  pattern as `classification`'s `OPERATIONS` default).
- **`expenseClass` and `uacsObjectId` are not cross-validated** — unlike
  AIP's `LineItem`, nothing enforces that the picked UACS object's own
  `expenseClass` matches the line item's; the UACS picker browses the whole
  catalog grouped by PS/MOOE/CO rather than filtering to the line item's
  Expense Class.
- **Comments nest exactly one level** — `addComment` 404s a
  `parentCommentId` that isn't a real comment on this Project, and rejects
  (400) a `parentCommentId` that itself has a parent.
- **A feedback item gets exactly one official reply** — `replyToFeedback`
  409s if `officialReply` is already set.
- **Reorder is all-or-nothing** — `PATCH /ppmp/:id/line-items/reorder`
  requires the submitted id set to exactly match the Project's current line
  items, same guard shape as `ReorderProgramsDto`.

## Client

- `client/src/app/ppmp-registry/` (office-grouped registry list, `new/`
  keeps only `_actions.ts` now — the create page is gone, see
  `new-project-drawer.tsx` below — `[id]` detail) +
  `client/src/components/ppmp/` (`ppmp-header`, `ppmp-registry-controls`,
  `ppmp-master-list`, `new-project-drawer`, `ppmp-line-items-section`,
  `ppmp-line-item-row`, `line-item-details`, `ppmp-uacs-object-selector`,
  `ppmp-detail-view`, `project-overview-drawer`, `project-comments-tab`,
  `project-feedback-tab`, `project-history-tab`). Reachable from the single
  shared navbar (`client/src/components/layout/navbar.tsx`) as a top-level,
  authenticated-only **PPMP Registry** entry — label only, the route stays
  `/ppmp-registry` — not a second nav (`specs/001-ppmp-creation/
  research.md` Decision 8). Data flow mirrors `programs/new`: typed fetch
  wrappers in `client/src/lib/api.ts` + `'use server'` `_actions.ts` files
  reading the session cookie. Office grouping
  (`client/src/lib/ppmp-grouping.ts`) and expand/collapse state
  (`client/src/hooks/useAIPExpand.ts`, reused as-is) mirror the AIP
  Registry's patterns, trimmed for PPMP's flatter shape — no
  component-program sections.
- **`new-project-drawer.tsx` is "New Project"** — a `Sheet` drawer, not a
  page (`/ppmp-registry/new` is gone). Asks for Office, **Classification**
  (`PPMP_CLASSIFICATIONS`, a `SimpleSelect`, required — no default
  selected), **Project Name**, and **Funding AIP Program** (both plain
  `Input`s — no Program picker; see Purpose above for why). On save it
  closes itself and opens `ProjectOverviewDrawer` for the new Project with
  `focusAddLineItem` set, continuing straight into the line-item form —
  same as the registry table's Plus icon.
- `ppmp-master-list.tsx`'s rows show separate Line Items, Status, and
  Estimated Total Budget columns (previously a single inline badge next to
  the name), plus a Grand Total footer row summing every visible Project —
  not just the existing per-office subtotals. Within each office group, rows
  are further sub-sectioned by `classification` via `groupByClassification`
  (`client/src/lib/ppmp-grouping.ts`) — a render-only regroup of the
  office's already-sorted list, deliberately kept separate from
  `groupPpmpsByOffice`/`sortGroupedPpmps` (whose totals, sort order, and
  existing tests are unaffected) — with a section-header `div` styled
  exactly like `aip-master-list.tsx`'s `papClass` section divider
  (`border-y border-slate-200 bg-slate-50 ... uppercase tracking-[0.12em]`).
  `GroupablePpmp.classification` is optional on the shared type since the
  public list's summary shape doesn't always carry it. **Each row's name
  button carries the Project's `fundingProgram` on a second, muted line
  below it** (`PpmpListRow` — the type consumed here, not `GroupablePpmp`
  itself — adds `fundingProgram`/`status`, wired through from
  `PpmpSummaryRecord` in `_registry-client.tsx`'s `groups` mapping). **Both
  lines truncate to one line each with a `title` tooltip for the full text,
  and the row has a fixed `min-h-[52px]`** — a two-line name+program block
  would otherwise grow that one row taller than its neighbors and throw off
  column alignment; the same fix applies to the page-variant header (`h1`
  gets `line-clamp-2` + `title`) and the drawer header (`h2`'s existing
  `line-clamp-2` now also carries a `title`). The Status column shows
  **two** badges side by side — Published/Unpublished (unchanged) and
  Draft/Approved/Revision (from `PpmpStatus` — see Purpose above, `Revision`
  styled violet to stay distinct from `Approved`'s blue and `Draft`'s amber);
  the column template widened from `130px` to `170px` to fit both without
  wrapping. When `isPublished` is `false` and `publishedAt` is already set
  (i.e. the Project went live before and is now hidden pending re-approval),
  the row's publish-toggle icon swaps from `Upload`/"Publish" to
  `RefreshCw`/"Republish" — same swap in `ppmp-detail-view.tsx`'s
  `publishAction`.
  Each row also carries a **blue-bordered** `Eye` ("View") and a `Plus`
  ("Add line item") icon button, mirroring `aip-master-list.tsx`'s
  `ActionIconButton` row-action pattern (same `size="icon-sm"` outlined
  button + `Tooltip`) rather than relying on clicking the name alone —
  **there is no per-row delete icon**; see the `ppmp-detail-view.tsx`
  bullet below for where delete moved. Both Eye and Plus open
  `project-overview-drawer.tsx` as a `Sheet` overlay — Eye lands on the
  Details tab as usual, Plus additionally passes `focusAddLineItem` down
  through `ppmp-detail-view.tsx` to `ppmp-line-items-section.tsx`, which
  `scrollIntoView`s the "Add a line item" form on mount so staff can jump
  straight past any existing line items.
- **Expanding a row's line-item sub-table (`PpmpLineItemsSubTable`) now
  carries a per-line-item, orange-bordered `Eye` and a plain `Pencil`
  icon.** Eye toggles an inline detail row beneath that line item, reusing
  `line-item-details.tsx` (extracted from `ppmp-line-items-section.tsx`'s
  former private `LineItemDetails`, so the master list's compact view and
  the drawer's own line-item view can never drift). Pencil calls
  `onEditLineItem(ppmpId, lineItemId)`, which opens
  `ProjectOverviewDrawer` with a new `focusEditLineItemId` prop threaded
  down to `ppmp-line-items-section.tsx` — on mount it seeds `editingId`
  from that prop (instead of `null`) and `scrollIntoView`s the now-open
  edit form, the same continuation pattern `focusAddLineItem`/
  `scrollToAddOnMount` already used. This reuses the drawer's existing,
  tested edit form (`PpmpLineItemRow` + `updatePpmpLineItem`) rather than
  building a second, parallel edit UI inside the master list.
- The line-item form (`ppmp-line-item-row.tsx`) shows a live "N of 5
  required fields" progress indicator as fields are filled — Type of
  Project, Mode of Procurement, and Expected Delivery/Implementation
  Period are excluded from that count since they're optional; picking
  "— None —" (the first option in each `SimpleSelect`) clears the field
  back to `undefined` rather than an empty string.
  `ppmp-uacs-object-selector.tsx` takes no `expenseClass` prop — it renders
  every active UACS object in three `SelectGroup`s (PS/MOOE/CO) at once,
  unfiltered; this predates Expense Class coming back and was deliberately
  not reverted (see Purpose above). **Expense Class itself (`EXPENSE_CLASSES`,
  a plain `SimpleSelect`) sits immediately after Fund Source in the line-item
  form's field order** — `grid-cols-2` auto-flow means DOM order is visual
  row order, so the two render side by side; Pre-Procurement Conference,
  which used to pair with Fund Source, now falls to its own row instead.
  **Line-item field order, after three rounds of adjustment, is: Line Item
  Name, Type of Project, Quantity, Unit, Unit Cost, Line Total, Recommended
  Mode of Procurement, UACS Object, Fund Source, Expense Class,
  Pre-Procurement Conference**, then Procurement Activity/Delivery Period/
  Supporting Documents/Remarks unchanged — the resulting `grid-cols-2`
  pairing is Type of Project|Quantity, Unit|Unit Cost, Line Total|
  Recommended Mode of Procurement, UACS Object|Fund Source. Quantity, Unit,
  Unit Cost, and Line Total are grouped as one consecutive block right after
  Type of Project on purpose — they're the four fields that together
  determine the computed total, so the office fills them as one unit; the
  latest adjustment swapped Quantity and Unit Cost within that block (was
  Unit Cost, Unit, Quantity — now Quantity, Unit, Unit Cost).
  **`ppmp-uacs-object-selector.tsx`'s trigger truncates the selected value
  to one line** (`min-w-0 flex-1 truncate` on the label span, `title` for
  the full text on hover) — without it, a long UACS description (e.g.
  "5010201000 — Personnel Economic Relief Allowance (PERA)") wrapped inside
  the trigger's fixed `h-11`, overflowing past the control's border.
  **The field's label and form-value key are `lineItemName`, not
  `projectName`** — end-to-end from `PPMPLineItem.lineItemName` (schema) to
  `CreatePpmpLineItemDto`/`UpdatePpmpLineItemDto`, `ppmpLineItemSchema`
  (`client/src/lib/schemas.ts`), `PpmpLineItemRecord`/
  `CreatePpmpLineItemPayload` (`client/src/lib/api.ts`), the sub-table
  column in `ppmp-master-list.tsx`, and the column in
  `public-ppmp-detail-view.tsx` — see Purpose above for why "Project Name"
  on a line item was confusing enough to rename everywhere, not just relabel.
- **`ppmp-line-items-section.tsx`'s per-line-item summary row now has a
  third icon, `Eye` ("View"), alongside Edit and Delete** — clicking it
  toggles a read-only `<dl>` panel (`LineItemDetails`) beneath the summary
  showing every field the collapsed 3-line summary doesn't (Type of
  Project, Mode of Procurement, Pre-Procurement Conference, Procurement
  Activity as a formatted month-year range, Expected Delivery/
  Implementation Period, Remarks, a link to the Attached Supporting
  Document if one exists) — without entering edit mode. `viewingId` is a
  second, independent piece of state alongside the pre-existing
  `editingId` (only one line item can be in each mode at a time); clicking
  Edit on a line item clears `viewingId` for it so the two never render
  simultaneously for the same row.
- **`ppmp-master-list.tsx`'s expanded-row sub-table
  (`PpmpLineItemsSubTable`) gained a first column, "Line Item Name"**
  (`max-w-[220px] truncate`, `title` for the full text) — previously the
  sub-table had no column showing the line item's own name at all, only
  its Type/Mode/UACS/amounts. `public-ppmp-detail-view.tsx`'s equivalent
  table got the same column (and its empty-state `colSpan` bumped from 9
  to 10 to match).
- **`ppmp-detail-view.tsx` has two distinct render modes, gated by a
  `variant: 'page' | 'drawer'` prop** — this is the one place the
  Comments/Public Feedback/History tabs are actually gated, so don't add a
  fourth call site without deciding which variant it should get:
  - `'page'` (the default, used by `client/src/app/ppmp-registry/[id]/
    page.tsx`, the full-page route reached after creating a Project or
    navigating in directly): a plain white header + the Details content
    only — **no tab bar**, Comments/Public Feedback/History are not
    reachable here at all.
  - `'drawer'` (used only by `project-overview-drawer.tsx`, itself only
    reachable via the registry table's Eye/Plus icons): a sticky blue
    header band styled directly after `client/src/components/aip/
    program-overview-drawer.tsx`'s `ProgramOverviewHeader` (`bg-blue-600`,
    a "PROJECT OVERVIEW" eyebrow label, status + line-item-count chips,
    mono AIP-code line, and its own in-header close `X` — `SheetContent`
    passes `showCloseButton={false}` so the sheet's own default corner `X`
    doesn't double up with it) plus the full `DrawerTabs` tab bar
    (Details/Comments/Public Feedback/History, reusing
    `client/src/components/aip/drawer-tabs.tsx`). This is the **only**
    place those three tabs are reachable — the plain page variant never
    renders them.
  Both variants share the same `PpmpLineItemsSection` content for Details
  and the same rename/approve/publish/delete actions; only the chrome
  around them differs. **Delete is reachable only through here — via the
  registry table's Eye icon, which opens this drawer.**
  - **The drawer header itself switches to orange "LINE ITEM OVERVIEW"
    while a line item is being edited**, not just blue "PROJECT OVERVIEW"
    for the Project it belongs to — this is the same blue/orange
    Project-vs-line-item scope convention used by the registry table's Eye
    icons (blue, per-Project) vs. its per-line-item Eye/Pencil (orange).
    `PpmpLineItemsSection` takes an `onEditingLineItemChange?: (name:
    string | null) => void` prop and fires it from a `useEffect` keyed on
    its own `editingId` state, since the header lives in the parent
    `PpmpDetailView` but the "which line item is being edited" state lives
    in the child. When `editingLineItemName` is non-null, `PpmpDetailView`
    swaps `bg-blue-600` → `bg-orange-600`, the eyebrow label to "LINE ITEM
    OVERVIEW", the heading text from the Project's name to the line item's
    name (subtitle becomes "In Project: {ProjectName}" instead of "Funding
    AIP Program: …"), and hides the rename-Project pencil button (renaming
    a Project doesn't make sense while a line item is in focus). Cancelling
    or saving the line-item edit reverts all of it.
  `ppmp-master-list.tsx` has no per-row delete icon — this is a single
  delete surface, not two. The header action row is `{approveAction}
  {publishAction} {deleteAction}`: `approveAction` renders only while
  `ppmp.status !== 'APPROVED'` (`POST /ppmp/:id/approve`);
  `publishAction`'s disabled/title logic now also checks approval status,
  not just "has a line item"; `deleteAction` is an `AlertDialog`-confirmed
  `Trash2` button. `PpmpDetailView` takes an `onDeleted?: () => void` prop
  (threaded through `project-overview-drawer.tsx`) that `_registry-client.tsx`
  uses to close the drawer and drop the row from local state after a
  successful delete.
- `new-project-drawer.tsx`'s submit button reads **"Save Project"** and, on
  success, chains into `ProjectOverviewDrawer` with `focusAddLineItem` set
  (see above) rather than a `sonner` toast + navigation — adding line items
  is the very next step, not a separate trip back to the registry table.
- **`project-fields-form.tsx`** extracts the shared Office/Classification/
  Project Name/Funding AIP Program field set out of `new-project-drawer.tsx`
  so `edit-project-drawer.tsx` (below) doesn't duplicate it — same
  extract-once-reuse pattern as `line-item-details.tsx`.
- **`edit-project-drawer.tsx`** is the registry master list's new
  project-level Pencil icon (distinct from the orange per-line-item Pencil)
  — a blue "EDIT PROJECT" `Sheet` that reuses `project-fields-form.tsx`,
  prefills from the row's current Office/Classification/Name/Funding AIP
  Program, and submits via a new `updatePpmpProject` action (`PATCH
  /ppmp/:id` with `officeId`/`classification`/`name`/`fundingProgram`).
  `_registry-client.tsx`'s `onSaved` does a full `refresh()` rather than a
  partial local-state merge — the PATCH response is a `PpmpRecord` (no
  `officeName`/`officeAcronym`, which the row display needs and only the
  list endpoint joins), so an office change needs a full reload to show
  correctly.
- `client/src/app/(public)/ppmp/` (public list + detail, unauthenticated) +
  `client/src/components/public/` (`public-ppmp-list`,
  `public-ppmp-detail-view`, `public-ppmp-drawer`,
  `public-ppmp-overview-sections`, `public-ppmp-line-items-table`) — a
  separate, read-only component tree, same split as the public AIP
  registry. Per-project feedback submission now embeds AIP's own
  `public-feedback-form.tsx` (Support/Oppose sentiment, Message with a
  10-word minimum, Type pills, Name/Email, honeypot) directly inside the
  "Public Feedback" section of `public-ppmp-overview-sections.tsx`, instead
  of a separate banner + `public-registry-feedback-dialog.tsx` modal — the
  two feedback UIs (AIP's and PPMP's) are now the same component, same
  fields, same enums. The public list's sort menu includes "Most Feedback",
  backed by `feedbackCount` from `GET /public/ppmp`'s `_count.feedback`.
- `public-ppmp-list.tsx` carries the LGU's government name as a kicker
  (uppercase, tracked-out `text-xs`) directly above the "Project
  Procurement Management Plans" page title, and a feedback banner ("Seen
  something worth saying?" / "Share feedback" button) after the office-
  grouped list — this general/unscoped registry feedback banner still opens
  `PublicRegistryFeedbackDialog` (a modal), copied verbatim in style from
  the public AIP registry's `public-registry-client.tsx` equivalent; it's
  unrelated to per-project feedback, which moved to an inline form (see
  `public-ppmp-overview-sections.tsx` below).
- **`public-ppmp-overview-sections.tsx`** is the sectioned "Project
  Overview" body — Details (office, cycle, funding AIP program,
  line-item count), a PS/MOOE/CO/Total Budget Summary grid, the line-items
  table, a History of Changes timeline, and a Public Feedback section, in
  that order — structurally mirroring `public-program-drawer.tsx` (AIP's
  public drawer). No Description/Expected Output/Remarks sections — those
  used to be read live off the linked Program; now that PPMP has no
  Program link (see Purpose above), there's no structured source for them.
  It's extracted into its own component (not inlined in a page) because it
  has **two** callers that must never drift apart: the full page
  (`public-ppmp-detail-view.tsx`, `/ppmp/[id]`) and the in-place drawer
  (`public-ppmp-drawer.tsx`, opened from `/ppmp`'s list). The Budget
  Summary's PS/MOOE/CO tiles are computed client-side from `ppmp.lineItems`
  (already fully returned by the detail endpoint) via `addDecimalStrings`,
  grouped by `expenseClass` — no new API field. The Public Feedback section
  embeds `PublicFeedbackForm` (AIP's own component, unmodified) directly —
  `onSubmitFeedback`/`onFeedbackSubmitted` props let each caller supply its
  own submit function and refresh callback while sharing one form
  implementation and one feedback-list rendering (with `SentimentIcon`/
  `CATEGORY_LABELS`, copied from `public-program-drawer.tsx`'s own
  rendering) between the page and the drawer.
- **`public-ppmp-drawer.tsx` is the primary way `/ppmp` opens a Project** —
  a `Sheet`-based slide-over mirroring `public-program-drawer.tsx` (AIP's
  "Program Overview" drawer) shape-for-shape: blue "Project Overview"
  label strip, header with name/funding-program/published-date, an
  embedded `PublicPpmpOverviewSections`. It fetches the Project, its
  history, and its feedback itself in a `useEffect` keyed on `ppmpId`
  (`loadPublicPpmp`/`loadPublicPpmpHistory`/`loadPublicPpmpFeedback`, all
  in parallel) rather than receiving them as props, since it can open for
  any Project the list is currently showing. Synced to a `?ppmp=<id>` URL
  query param the same way `public-registry-client.tsx` syncs
  `?program=<id>` for `PublicProgramDrawer`, so a drawer view is a
  shareable/back-button-able URL. **`public-ppmp-detail-view.tsx`/
  `/ppmp/[id]` still exists** as the full-page, SEO-indexable route — same
  dual pattern AIP uses (`PublicProgramDrawer` for in-list viewing,
  `/aip/[programId]` for direct links).
- **`public-ppmp-list.tsx` opens the drawer only via a dedicated,
  blue-bordered Eye icon** on each Project row — mirroring
  `ppmp-master-list.tsx` (authenticated), where the row body toggles an
  expand and a separate `Eye` `ActionIconButton` opens
  `ProjectOverviewDrawer`. An earlier iteration made the whole row open
  `PublicPpmpDrawer` directly, which broke the row's other job: toggling
  the per-Project line-item dropdown (`expandedPpmpIds`/`lineItemsById`,
  restored) that shows just the line-items table inline without leaving
  the list. The row click calls `handleTogglePpmp`; the Eye button calls
  `setSelectedPpmpId(p.id)` with `stopPropagation` so it doesn't also
  toggle the dropdown underneath it. Rows are further sub-sectioned by
  `classification` via `groupByClassification`, same as the authenticated
  master list. `public-ppmp-line-items-table.tsx` carries its own
  per-line-item, orange-bordered `Eye` toggling an inline
  `line-item-details.tsx` panel — read-only, no Pencil (the public list
  has no edit capability).

## Dependencies

`PrismaService`, `OfficeScopeService` (`permissions`), `StorageService`
(`storage` — document upload only). No dependency on the `programs`
module's services, `project-activities`, `line-items`, `aip-codes`, or
`budget-rollup` — the PPMP workflow itself still doesn't participate in AIP
workflow logic (`specs/001-ppmp-creation/research.md` Decision 5).
`PpmpExportService` additionally depends on `api/src/aip-registry/
excel-style.ts`'s shared ExcelJS helpers (styling only — no AIP data
dependency).

## Related

- `specs/001-ppmp-creation/spec.md` — original feature spec and acceptance scenarios
- `specs/001-ppmp-creation/research.md` — the "why", including why this was originally unlinked to AIP
- `specs/001-ppmp-creation/data-model.md` — original entity/field reference
- `specs/002-ppmp-registry/spec.md` — registry/publish/export feature spec
- `specs/002-ppmp-registry/research.md` — the "why" for publish-as-a-flag, registry filter axes, and reused AIP Registry pieces
- `specs/003-ppmp-procurement-fields/spec.md` — GPPB-aligned fields, the first (line-item-level) Program link, document upload
- `specs/003-ppmp-procurement-fields/research.md` — the "why" behind snapshotting the Program's code and mirroring `mail` for `storage`
- `specs/005-ppmp-to-project/spec.md` — "PPMP" → "Project" product rename, Program link moved to the Project, Comments/Public Feedback/History tabs
- `specs/005-ppmp-to-project/research.md` — the "why" behind moving the Program link up a level, the per-Project feedback reversal of specs/004, and the timeline-not-audit-log History design
- [storage.md](storage.md) — the file-storage module `attachDocument` depends on
- [programs.md](programs.md) — the AIP workflow this module deliberately does not join, except for the Project-level Program snapshot
