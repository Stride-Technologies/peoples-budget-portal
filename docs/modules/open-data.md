# Module: `open-data`

**Folder:** `api/src/open-data/` · Spec: `specs/007-developers-page/` · Contract: `contracts/open-data-api.md`

## Purpose

Publishes each budget year's **published** data as open data: one zip per year
(five CSVs, a nested JSON file, `METADATA.md`) and a small anonymous, read-only,
versioned JSON API. It is a separate contract from the site's `/public/*` routes,
so the site can change without breaking anyone who builds on the data.

Exactly what the public site shows, nothing more:

- programs are `PUBLICLY_VISIBLE` (`deletedAt` null, `publishedVersionId` set), read
  from their **published snapshot**, never the live draft;
- Projects (PPMP) are `isPublished`;
- no feedback, no comments, no line items of programs, nothing about people.

**One dataset per document** (specs/012 D14). A year can hold the AIP (the
proposal) and the Annual Budget (the enacted budget). Every year route takes
`?document=aip|annual`; without it the route serves the **default document** —
the AIP while the year is in the public AIP section, otherwise the Annual Budget
(`OpenDataService.documentsOf`, which reads `loadCycleSections`, the public
site's own rule). So the year URL never changes meaning. The Annual Budget is
built from the enacted Ordinance's PPAs (`loadOrdinanceViews` → `asProgramView`
→ the same mapper) once one exists; FY2026 before its enactment reads its
published programs. Ordinance PPAs have no versions (the `/versions` routes 404),
`version` is null and `publishedAt` is the enactment time.

A year is served only while a super admin has switched it on
(`AIPCycle.openDataEnabled`). Every other year — and every year that does not
exist, and every document a year lacks — answers the same `404 {"statusCode":404,"message":"No open data for this year"}`.

```mermaid
flowchart LR
    S[(published snapshots<br/>+ PPMPs)] --> M[open-data.mapper.ts<br/>named fields only]
    O[(enacted Ordinance<br/>PPAs)] --> V[asProgramView] --> M
    M --> D[dataset per year × document<br/>cached under pub:registry:]
    D --> API[JSON routes]
    D --> Z[bundle.zip<br/>CSV + JSON + METADATA.md]
    Z --> N[Next route<br/>/open-data/&lt;year&gt;/&lt;lgu&gt;-budget-&lt;year&gt;[-aip/-annual].zip]
```

## The allow-list rule

A `ProgramVersion.snapshot` is the raw Prisma row with its tree: it carries
`createdByUserId`, `publishedByUserId`, `sourceRef`, `remarks`, line items. The
mapper **never spreads it**. Every output key is named in a column definition in
`open-data.mapper.ts` (`PROGRAM_COLUMNS`, `ACTIVITY_COLUMNS`, `FUND_COLUMNS`,
`CLIMATE_COLUMNS`, `PROJECT_COLUMNS`), and:

- `open-data.mapper.spec.ts` feeds a real 2027 snapshot salted with staff ids,
  emails, provenance, line items and feedback, and fails if any output row has a
  key outside its column list or any salted key/value reaches the CSV or JSON;
- `METADATA.md`'s data dictionary is generated from the same lists, so the
  dictionary and the files cannot drift.

To expose a new field, add a column. That is the only way in.

Money is `Prisma.Decimal#toFixed(2)` text. A program's figure is
`proposedTotal`, never re-derived from activities. PS/MOOE/CO use the public
detail's `snapshotExpenseClassAmount` fallbacks. **FE** (Financial Expenses,
specs/008) reads the snapshot only — no live fallback — so a version published
before FE existed reads `0.00` and an unpublished FE never leaks. Fund lines
carry `fe` too (`total = ps + mooe + fe + co`). Special funds' stated amounts
are never part of open data. A row with `fundAllocations`
yields `split` fund lines with amounts; otherwise its `fundSources` become
`total` lines without amounts (also how pre-split snapshots read).

## Endpoints

Base `/api/v1/open-data`. `@Public()`, throttled **60 / minute / visitor IP**
(`OpenDataThrottlerGuard`, contract 429 body — deliberately states no number; the public page says only that there is a limit), `Cache-Control: public, max-age=60`
on JSON. Anything but GET/HEAD → `405`; unknown paths → `404`.

| Method | Path | Description |
|---|---|---|
| GET | `/cycles` | Every cycle: `{ fiscalYear, document, open, dataAsOf, bundleUrl, documents }` — `document`/`bundleUrl` are the default's; `documents` lists each with its own zip |
| GET | `/cycles/:year` | Counts and totals (`totals.proposed` = the site's year total) |
| GET | `/cycles/:year/programs` | Programs without activities; `office`, `sector`, `finishLine`, `code`, `page`, `limit` (≤ 500) |
| GET | `/cycles/:year/programs/:id` | One program, nested activities, funds, climate tag |
| GET | `/cycles/:year/programs/:id/versions` | Published versions: `{ version, publishedAt, office }`, never a person |
| GET | `/cycles/:year/programs/:id/versions/:version` | One published version, same shape as the program |
| GET | `/cycles/:year/projects` | Published PPMPs |
| GET | `/cycles/:year/bundle.zip` | The zip, with an `ETag` from `dataAsOf` (304 on a match); named `<lgu>-budget-<year>[-<document>].zip` |

Every `/cycles/:year…` route takes `?document=aip|annual` (above).
| GET | `/reference/{offices,finish-lines,pap-sectors,ccet-codes,fund-sources}` | Names already on every public page; not gated by the switch |

CORS: `main.ts` answers `Access-Control-Allow-Origin: *` for this prefix only,
GET/HEAD, no credentials. The rest of the API stays denied.

The `v1` in the global prefix is this contract's version. A breaking change is a
new controller at `/api/v2/open-data` (plus an nginx location — nginx owns only
`/api/v1/` today), with v1 kept six months.

## The switch

`PATCH /aip-cycles/:id/open-data` (`cycles:write` + `SUPER_ADMIN`,
`AIPCyclesService.setOpenData`), the "Open data" control on
`/control-panel/aip-cycles/[id]`. It also drops the public registry cache, so a
closed year cannot be served from a cached bundle.

## Caching

`OpenDataService` caches one **dataset** per open year and document (every
program mapped once) and the **zip** (base64), both under `PUBLIC_REGISTRY_KEY_PREFIX` with the
300 s TTL. Publishing, discarding, deleting a program, public feedback and the
switch already call `invalidatePublicRegistry()`, so the open data refreshes
exactly when the public list does; the TTL covers PPMP publish/unpublish, which
does not invalidate. The keys carry the enacted Ordinance's id, so enacting one
(a CLI step that cannot reach the API's cache) switches the year's Annual Budget
on the next request. `getOrSet` swaps whole entries, so a reader gets the old zip
or the new one, never half.

`dataAsOf` is the newest **published version's** time (`ProgramVersion.submittedAt`),
not `Program.publishedAt`, which is set on first publish only. A rebuild caused by
feedback does not move it.

## Client

| Path | What |
|---|---|
| `client/src/app/(public)/developers/open-data/page.tsx` | Developers → Open data tab; years list revalidates every 60 s |
| `client/src/app/(public)/developers/source-code/page.tsx` | Developers → Source code tab; GitHub link disabled until the repo is public |
| `client/src/components/public/developers-nav.tsx` | The two tabs |
| `client/src/app/(public)/open-data-policy/page.tsx` | "Coming soon" placeholder (noindex, not in the sitemap) until the City adopts the policy; the draft with CC BY 4.0 is in git at `ae3131e` |
| `client/src/app/(public)/open-data/[year]/[file]/route.ts` | Streams the zip same-origin, forwards `X-Real-IP` |
| `client/src/app/control-panel/aip-cycles/[id]/_open-data-toggle.tsx` | The switch |

`/docs` 308-redirects to `/developers/open-data`; `/developers` 307-redirects there too. **Developers** is in the visitor nav, the staff navbar's public pages and the footer.

## Licence

`OPEN_DATA_LICENCE_CONFIRMED` in `open-data.metadata.ts` is `false` until the
City adopts CC BY 4.0; `METADATA.md` then says the terms are pending. Flip it in
the same change as the policy page's unconfirmed copy.

## Tables touched

Reads `aip_cycles`, `programs`, `program_versions`, `offices`, `clusters`,
`finish_lines`, `pap_sectors`, `ppmps`, `ppmp_line_items` (`line_total` only),
`climate_typology_codes`. Writes `aip_cycles.open_data_enabled` (via `aip-cycles`).

## CSV safety

The CSV writer (`open-data.csv.ts`) prefixes a text cell that starts with
`=` `+` `-` `@`, a tab or a CR with `'`, so a spreadsheet never runs it as a
formula. Numbers, including negative amounts, are written as they are.
