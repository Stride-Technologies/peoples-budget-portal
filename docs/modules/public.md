# Module: `public`

**Folder:** `api/src/public/`

## Purpose

Serves the **unauthenticated public registry** — the citizen-facing view of AIP
programs and the channel for anonymous public feedback. Every route is
`@Public()` (no Bearer token); the whole controller is exempt from `JwtGuard`.

Only programs in a **publicly visible** status are ever returned:

```
PUBLIC_STATUSES = [PENDING_APPROVAL, APPROVED]
```

Anything in `DRAFT`, `FOR_REVISION`, `SUBMITTED`, `HEAD_REVIEWED`, or
`REJECTED` is invisible to the public.

## Endpoints

All routes are `@Public()`. The three feedback `POST`s are additionally wrapped
in `ThrottlerGuard` (**5 requests / 10 minutes / IP**; exceeding it returns `429`).

| Method | Path | Throttled | Description |
|---|---|---|---|
| GET | `/public/cycles` | — | All AIP cycles: id, fiscalYear, `sections`, stage, Overview switches, `lastPublishedAt` (newest publish among listed programs) and the enacted ordinance's `statedTotal` / `statedOfficeTotal` / `statedSpecialTotal` / `statedSource` (a headline, never summed — specs/013), `annualDocumentKind` (`ORDINANCE`, or `LEP` for a historical year known only by its proposal, specs/017) and `hasEnactedOrdinance`: once true, the Annual Overview's headline is the rows' sum and the stated total is not shown (specs/016) |
| GET | `/public/annual/:year/book` | — | The rest of the year's public Annual document (specs/017): receipt lines (a tree by `parentId`; `officeAcronym` set = an enterprise's own sheet), Form 5 loans, Form 6 obligations, and the RECEIPTS / PS_LIMIT / FORM5 / FORM6 printed totals. Named columns only, no provenance. 404 when the year has no public Annual document. Read by `/annual/<fy>/receipts` and `/spending` |
| GET | `/public/annual/:year/objects?office=` | — | Spending by object (LBP Form 2): every office's line count and total, and with `office` that office's lines with their three printed years. An uncoded line equal to another sheet's whole total (the SPA sheet's "20% LDF" line) is left out, so no peso is shown twice |
| GET | `/public/fund-rules/:fund?year=` | — | The law behind a fund as of a fiscal year: the newest `FundRule` with `effectiveFrom ≤ year` — legal basis, plain-language description, minimum as a floor (`minimumPercent` string, `minimumBase`). 404 for an unknown fund or one with no rule; 400 without a year. Read by `/annual/<fy>/funds/<fund>` (specs/016) |
| GET | `/public/clusters` | — | Clusters with their active city offices |
| GET | `/public/finish-lines` | — | Finish lines, ordered by `visionNumber` |
| GET | `/public/pap-sectors?cycleId=` | — | PAP sectors that have publicly visible programs |
| GET | `/public/registry?cycleId=…` | — | Paginated, filterable list of publicly visible programs |
| GET | `/public/registry/:programId` | — | One publicly visible program (internal fields stripped). An ARCHIVED program still answers, with `archived: { at, reason }`; its lists and totals do not include it, and its feedback `POST` returns 404 |
| GET | `/public/registry/:programId/versions` | — | Version history (submitter name + role) |
| GET | `/public/registry/:programId/versions/:versionId` | — | One version's full snapshot |
| GET | `/public/registry/:programId/project-activities/:paId` | — | One Project/Activity with line items + children |
| POST | `/public/registry/feedback` | ✅ | Submit general registry-level feedback (not tied to a program) |
| POST | `/public/registry/:programId/feedback` | ✅ | Submit anonymous feedback on a program |
| GET | `/public/registry/:programId/feedback` | — | List a program's public feedback |
| POST | `/public/registry/:programId/project-activities/:paId/feedback` | ✅ | Submit anonymous feedback on a Project/Activity |
| GET | `/public/registry/:programId/project-activities/:paId/feedback` | — | List a Project/Activity's public feedback |
| GET | `/public/ppmp?cycleId=…` | — | Published PPMPs for a cycle, optionally one office |
| GET | `/public/ppmp/:id` | — | One published PPMP's full detail; 404 if not published |

## Enacted Ordinance years (specs/012)

A year whose Ordinance is ENACTED is served from its Budget Document rather than from
`Program` rows, in the same response shapes, through `ordinance-registry.ts`
(`asProgramView`, the adapter open data and the LBP forms share):

- **`GET /public/registry?cycleId&section=aip|annual`**: `section=annual` reads the
  Ordinance, and `aip` reads the AIP. With no section, a year in both sections reads its AIP
  and a year in Annual only reads its Ordinance. Annual pages pass `annual`, AIP pages pass `aip`.
  The tag filter (AND across tags, any PPA of the tree) and tag-name search behave as on the AIP.
  `finish-lines` and `pap-sectors` take the same `section`.
- **`GET /public/registry/:id`** and **`…/project-activities/:paId`** look up an **enacted
  PPA first** (eng review 6A). The old 2026 Program/PA ids are reused by the re-import, so
  indexed links keep working. An old "mirror" PA id (a program's own money in the
  old model) lands on the root's own money.
- **Feedback** on an Ordinance PPA is written to `ProgramComment.budgetItemId`. A root's
  feedback list covers every PPA of its tree, as a program's covers its PAs.
- **`/versions`** is `[]` for an Ordinance PPA: the enacted document is the record.
- A **historical year's SUBMITTED LEP** is served here when it has no enacted Ordinance (specs/017 FR-002: FY2023–25). `PUBLIC_ANNUAL_DOCUMENT` is the one predicate for "the Annual section's document"; the list, the detail pages and `computeSections` all read it. A current year's LEP is never served.
- **Special funds** (specs/016): SPA, LDF and LDRRMF rows are ordinary PPAs under their office, with
  the fund on `BudgetItem.fundSource`. `fundSource=LDF` on the registry is the fund filter (#229), and
  `/annual/<fy>/funds/<fund>` is built from it plus `fund-rules`.

## `GET /public/registry`

`cycleId` is **required**. Optional filters: `clusterId`, `officeId`
(matches the implementing office **or** any tagged supporting office),
`finishLineId` (repeatable → array), `papSectorId`, `search` (matches program
name, `tentativeAipReferenceCode`, or `aipReferenceCode`, case-insensitive).

**There is no `sortBy`.** Rows come back ordered `office.acronym` → `papClass`
(GAS → STO → OPERATIONS, nulls last) → `orderIndex` → `createdAt` — the same
ordering `AIPRegistryService.list` uses, and the reason the public table can group
by office: `client/src/lib/aip-grouping.ts` walks that order by run-length rather
than re-sorting, so a user-chosen ordering would scatter each office's band. The
old five-way sort was removed with the sort dropdown.

Pagination: `page` (default 1), `limit` (default 25, **max 1000** — matching
`AIPRegistryService.MAX_PAGE_SIZE`, because grouping is only correct over the
complete result set, so the registry page requests a whole cycle at once).

**What the browse page sends to the browser is smaller than this response (#91).**
`client/src/lib/public-registry-list.ts` `toListItems` keeps only the fields the
table reads, and the server render ships programs **without** their PA trees:
offices start collapsed, so the first office a visitor opens loads the trees in one
`loadPublicRegistryList` call, and every filter or search fetch carries them.
2026 went from 867 KB to 497 KB of HTML (dev build), and the page no longer
refetched the whole cycle 300 ms after loading. A field the table starts reading
has to be added to `toListItems`, or it arrives `undefined`.

The response is computed in a single `$transaction` (count + budget aggregate +
page) and returns `{ total, page, limit, totalBudget, items }`. Each item
carries decimal totals serialized as **strings** (`.toFixed(2)`), `papClass` and
`hostOffice` (set only on a component program — the office whose printed sheet it
appears under, which decides its band), a `feedbackCount` (PUBLIC_FEEDBACK
comments only), and `lastUpdatedAt` (the latest version's `submittedAt`, falling
back to the program `updatedAt`).

**The whole response is cached** in Redis under `pub:registry:<hash>` (TTL 300 s).
It is anonymous and identical for every visitor, so one entry per filter
combination serves everyone — including the homepage's `limit: 1` stat-tile call,
which otherwise ran this entire transaction on every visit. `page` and `limit` are
clamped *before* the key is built, so `limit: 5000` and `limit: 1000` share an
entry. The whole-cycle fetch is therefore served from cache in production rather
than re-running the transaction per visitor.

Invalidated via `RegistryCacheService.invalidatePublicRegistry()` on publishing
(including revision discard), program soft-delete, and public feedback — the last
because `feedbackCount` is in the payload and `most_feedback` sorts on it. The
active office count rides the `ref:` group instead, since it is reference data.
See [cache-redis.md](cache-redis.md).

## `GET /public/registry/:programId`

Returns the program only if it is non-deleted **and** in a public status.
Internal-only scalars are stripped before returning: `createdByUserId`,
`rejectionReason`, `currentVersion`, `deletedAt`.
Import provenance (`sourceRef`, `sourceDocumentId` — the row in the city's
internal workbook) is stripped too, from the live row *and* from the snapshot's
program and PPAs via `stripProvenance`; the version endpoint does the same. The
"open in sheet" link is a staff-registry feature only.

## Anonymous feedback

Two storage paths, both anonymous (no `authorUserId`):

- **Program / Project-Activity feedback** → a `ProgramComment` with
  `stage = PUBLIC_FEEDBACK`. The submitter's name and email are stored in
  `submitterName` / `submitterEmail`. Only the moderation routes
  (`public_comments:view`) return them; every staff comment read omits them
  (`OMIT_SUBMITTER`).
  Project/Activity feedback sets `targetType = PROJECT_ACTIVITY` + `targetId`.
- **General registry feedback** → a `PublicRegistryFeedback` row
  (`submitterName?`, `submitterEmail?`, `category` default `GENERAL`, `message`).

Both feeds are moderated by admins/HEADs through the [`admin`](admin.md) module
(`/admin/registry-feedback`, `/admin/program-feedback`), **not** here. This
module only accepts submissions and lists already-public feedback.

## `GET /public/ppmp` and `GET /public/ppmp/:id`

Unrelated to the Program registry above — see [ppmp.md](ppmp.md). Visibility
is `isPublished: true` on the live `PPMP` row directly (no version/snapshot
to prefer, unlike Program): `listPpmp(cycleId, officeId?)` and `getPpmp(id)`
read straight off it. Uncached, unlike `GET /public/registry` — PPMP's row
count doesn't carry the traffic weight that justifies the cache-by-filter-key
here.

`listPpmp` does a plain `include`-based `findMany` with no `select`, so the
full `PPMP` row — including `createdAt`/`updatedAt` — is already in the
response even though the route handler doesn't call them out explicitly.
The public PPMP page's client-side search/sort/feedback toolbar (see
`specs/004-ppmp-public-toolbar/`) relies on those two fields for its
"Recently Updated"/"Newest" sort modes; if this method ever moves to an
explicit `select`, keep both fields in it.

## Services

- **`PublicService`** — all read queries and the feedback writers. The private
  `assertPubliclyVisible(programId)` guard gates every program-scoped route.
  `listPpmp`/`getPpmp` are separate methods on the same service — no
  dedicated `public-ppmp` module.

## DTOs

- `PublicFeedbackDto` — `{ submitterName, submitterEmail?, message }` (program / PA feedback)
- `PublicRegistryFeedbackDto` — `{ submitterName?, submitterEmail?, category?, message }`

## Tables touched

`Program`, `ProgramVersion`, `ProjectActivity`, `LineItem`, `ProgramComment`,
`PublicRegistryFeedback`, `Cluster`, `Office`, `FinishLine`, `PAPSector`,
`AIPCycle`, `FundRule`, `User` (submitter names on version history), `PPMP`,
`PPMPLineItem`.

## Dependencies

`PrismaService`, `ThrottlerGuard` (rate-limiting the feedback `POST`s),
[`CacheService` + `RegistryCacheService`](cache-redis.md).

## Related

- [admin.md](admin.md) — where HEAD/SUPER_ADMIN moderate the feedback this module collects
- [comments.md](comments.md) — the `ProgramComment` model + `PUBLIC_FEEDBACK` stage
- [aip-registry.md](aip-registry.md) — the authenticated, internal counterpart to this registry
- [ppmp.md](ppmp.md) — the module `listPpmp`/`getPpmp` read from
