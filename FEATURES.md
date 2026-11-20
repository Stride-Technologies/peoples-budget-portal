# Features

What the portal does, and how finished each part is. Behaviour is in [`SPEC.md`](SPEC.md).

**Status:** ✅ works · 🟡 partial · 🔭 experimental, off by default · ⏸ parked

## Staff app

| Feature | Status | API module |
|---|---|---|
| Programs with nested projects and activities: create, edit, reorder, soft-delete, in the registry's drawers | ✅ | `programs`, `project-activities` |
| Cost estimates by expense class (PS, MOOE, FE, CO) with roll-ups | ✅ | `budget-rollup` |
| Cost split by fund source; special funds (LDF, SPA, LDRRMF) as funds with legal minimums | ✅ | `budget-rollup`, `aip-cycles` |
| Line items (UACS-coded cost rows) | 🟡 the API works; not part of publishing | `line-items` |
| Climate-change tagging with the local CCET typology | ✅ | `climate-tags` |
| Thematic tags (PWD, senior citizens, youth, women, children, LGBTQIA+, open-ended) | ✅ | `thematic-tags` |
| AIP reference codes: tentative while drafting, final on adoption | ✅ | `aip-codes` |
| Publish, open a revision, discard a draft, readiness check | ✅ | `programs` |
| Versions, compare two versions, field-level edit history | ✅ | `programs`, `program-audit` |
| Archive a superseded published program (kept for its history, counted nowhere) | ✅ | `programs` |
| Internal comments: threads, resolve, moderate; unread state and live updates | ✅ | `comments`, `events` |
| AIP registry: filters, tabs, remembered view | ✅ | `aip-registry` |
| Exports: the complete AIP in DBM format, per-cluster workbook, annual budget document (Word) | ✅ | `aip-registry` |
| LBP Forms 4 and 7 (xlsx), by fund | ✅ | `aip-registry` |
| Dashboard: progress by office, totals by class, fund and goal | ✅ | `dashboard` |
| Public-feedback inbox and analytics | ✅ | `lgu`, `admin` |
| Fiscal years: open, close, adopt; ceilings per goal; publish a whole year | ✅ | `aip-cycles`, `budget-ceilings` |
| Budget documents: the proposed budget (LEP) from the AIP, the Appropriation Ordinance from the LEP; review, submit, enact; receipts, by-object lines, LBP Forms 5 and 6 | 🟡 works in the app; the import from a printed book reads one city's layout | `budget-documents`, `budget-cycles` |
| Users: invite, roles, named permissions, office scope, deactivate | ✅ | `users`, `permissions` |
| Offices, clusters, goals and other reference data | ✅ | `reference` |
| Account: profile, password, sign-in codes by e-mail, activity | ✅ | `auth`, `users` |
| CSO accounts: a people's council and its member organizations read and comment on entries in their cluster | ✅ | `users`, `comments` |
| Approval workflow (submit → head review → finance committee) | ⏸ not in this codebase; programs are published by their office | |

## Procurement plans (shown as "Projects")

| Feature | Status | API module |
|---|---|---|
| Plans with GPPB-shaped line items; indicative and final | ✅ | `ppmp` |
| Approve, publish, unpublish; a revision opens on edit | ✅ | `ppmp` |
| Supporting documents (S3-compatible storage) | ✅ up to 10 MB | `ppmp`, `storage` |
| Comments, public feedback, history, export | ✅ | `ppmp` |

## Public site

| Feature | Status | Route |
|---|---|---|
| Home, with the current stage of the budget cycle | ✅ | `/` |
| AIP, Annual Budget and procurement sections: overview, browse, methodology; an empty state until a year is posted | ✅ | `/aip/[year]/*`, `/annual/[year]/*`, `/ppmp/[year]/*` |
| Income and spending tabs for an enacted budget; a page per special fund | ✅ | `/annual/[year]/receipts`, `/spending`, `/funds/[fund]` |
| Program and activity pages with feedback | ✅ | `/budget/*` |
| Learn: the budget cycle in ten stages, AIP vs Annual Budget, reading an entry, glossary | ✅ worded for any LGU; have a budget officer read it against your practice | `/learn/*` |
| Privacy policy, terms, licence, source code | ✅ the first two are templates until reviewed | `/privacy-policy`, `/terms`, `/license`, `/developers/source-code` |
| Open data: per-year zip (CSV, JSON, data dictionary) and a read-only API, switched on per year | ✅ | `/developers/open-data`, `/api/v1/open-data/*` |
| Filipino; Bikol as an example of a local language | 🟡 some strings fall back to English until re-translated and reviewed | `/fil/…`, `/bcl/…` |
| SEO: sitemap, robots, JSON-LD, share image drawn from the LGU's settings | ✅ | |
| Search engines kept out until the site is marked production | ✅ | |
| Data Explorer: chart builder over every public year, share links, exports; AI question box | 🔭 | `/explore` |

## Not yet general

Read this before promising the portal to an LGU.

| Limit | Detail |
|---|---|
| No spreadsheet importer for an AIP | The loader reads JSON ([`docs/loading-your-data.md`](docs/loading-your-data.md)). Each LGU converts its own workbook |
| The printed-book importer reads one city's layout | `db:seed:document` and `api/prisma/ab-2026-book.ts` |
| The Data Explorer was tuned on one city | Topics, labels and the barangay map are Naga City's. The chart builder itself is general |
| A province's development council | Copy says "with barangay captains"; a province's council seats mayors |
| Database names keep the first deployment's words | Tables `finish_lines`, `ncpc_users`; the fund source `CCN` (shown as "Local college fund"); the staff route `/finish-lines`. Labels are settings; names change at 1.0 |
| Browser tests | `client/e2e` was written against the first deployment's data and has not been run here |
| Goals are numbered 1 to 8 | Fewer is fine; more than eight needs a code change (colours) |
