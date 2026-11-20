# Module: `reference`

**Folder:** `api/src/reference/`

## Purpose

Serves the read-mostly reference data the AIP domain is built on — the LGU's
strategic framework (clusters, finish lines, offices, CSOs) and the DBM/DILG
catalogs (PAP sectors, UACS objects, SGLG indicators, SDG goals, climate
codes). A few write endpoints let `SUPER_ADMIN` curate the LGU-local rows.

## Endpoints

### Clusters & Finish Lines

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/clusters` | Authenticated | Clusters with active offices and finish lines |
| GET | `/reference/clusters/all` | SUPER_ADMIN | Clusters including inactive offices |
| PATCH | `/reference/clusters/:id` | SUPER_ADMIN | Rename a cluster |
| GET | `/reference/finish-lines` | Authenticated | Finish lines, ordered by vision number (embeds active sub-finish lines) |
| PATCH | `/reference/finish-lines/:id` | SUPER_ADMIN | Update a finish line |
| GET | `/reference/sub-finish-lines` | Authenticated | Active sub-finish lines |
| GET | `/reference/sub-finish-lines/all` | SUPER_ADMIN | All sub-finish lines including inactive |
| POST | `/reference/sub-finish-lines` | SUPER_ADMIN | Create a sub-finish line |
| PATCH | `/reference/sub-finish-lines/:id` | SUPER_ADMIN | Update a sub-finish line |
| DELETE | `/reference/sub-finish-lines/:id` | SUPER_ADMIN | Deactivate a sub-finish line (`isActive = false`) |

### Offices

One table. `officeCode`, `officeType` and `lguLevel` used to live on a separate
`DBMOffice` row that each city office pointed at; they are columns on `Office`
now, and the `/reference/dbm-offices` routes are gone.

Offices also carry a nullable `papSectorId` — the office's usual PAP sector.
It pre-selects the sector field on the new-program form and is **not** an AIP
code segment (see below). Managed at **Control Panel → Offices**; the Clusters
page lists offices read-only.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/offices` | Authenticated | Active offices with their cluster, by cluster then acronym |
| GET | `/reference/offices/all` | SUPER_ADMIN | All offices including inactive, by office type then code |
| POST | `/reference/offices` | SUPER_ADMIN | Add an office |
| PATCH | `/reference/offices/:id` | SUPER_ADMIN | Update an office — including `form7Column` (LBP Form 7 column, `null` = unassigned) not an AIP code segment |
| DELETE | `/reference/offices/:id` | SUPER_ADMIN | Deactivate an office (`isActive = false`) |

#### Editing an office code or type rewrites AIP codes

`officeCode` and `officeType` are two of the seven AIP reference code segments,
so changing either restates the tentative code of every PPA under that office.
`updateOffice` compares both against the stored row and, when either moved,
calls `resyncCodesForOffice` inside the same transaction — distinct
`(aipCycleId, papSectorId)` scopes for the office, each handed to
`resyncTentativeProgramCodes`. Final codes are immutable and never touched.

**`papSectorId` is deliberately outside that check.** The code's sector segment
comes from `Program.papSectorId`, so an office's own sector never moves a code;
including it would resync thousands of rows for nothing.

**Codes are free text and not unique.** The city assigns them by hand, and
several offices share one on purpose (CMO-NCYDO, CMO-MNDC and CMO-SPORTS all sit
on CMO's `01`). Offices sharing a code *and* type emit identical AIP reference
codes; the control-panel form warns and names the other office rather than
blocking. There is no reorder endpoint — codes are typed, not positional.

### Civil Society Organizations

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/civil-society-organizations` | Authenticated | Active CSOs with their cluster |
| GET | `/reference/civil-society-organizations/all` | SUPER_ADMIN | All CSOs including inactive |
| POST | `/reference/civil-society-organizations` | SUPER_ADMIN | Create a CSO |
| PATCH | `/reference/civil-society-organizations/:id` | SUPER_ADMIN | Update a CSO |
| DELETE | `/reference/civil-society-organizations/:id` | SUPER_ADMIN | Deactivate a CSO (`isActive = false`) |

### PAP Sectors

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/pap-sectors` | Authenticated | Active PAP sectors (BOM Annex 2) |
| GET | `/reference/pap-sectors/all` | SUPER_ADMIN | All PAP sectors including inactive |
| POST | `/reference/pap-sectors` | SUPER_ADMIN | Create a PAP sector |
| PATCH | `/reference/pap-sectors/:id` | SUPER_ADMIN | Update a PAP sector |
| DELETE | `/reference/pap-sectors/:id` | SUPER_ADMIN | Deactivate a PAP sector (`isActive = false`) |

### UACS Objects

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/uacs-objects` | Authenticated | Search active UACS objects (capped 200), filter by expense class |
| GET | `/reference/uacs-objects/all` | SUPER_ADMIN | All UACS objects including inactive |
| POST | `/reference/uacs-objects` | SUPER_ADMIN | Create a UACS object |
| PATCH | `/reference/uacs-objects/:id` | SUPER_ADMIN | Update a UACS object |
| DELETE | `/reference/uacs-objects/:id` | SUPER_ADMIN | Deactivate a UACS object (`isActive = false`) |

### SGLG Indicators

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/sglg-indicators` | Authenticated | Active SGLG indicators (DILG framework) |
| GET | `/reference/sglg-indicators/all` | SUPER_ADMIN | All SGLG indicators including inactive |
| POST | `/reference/sglg-indicators` | SUPER_ADMIN | Create an SGLG indicator |
| PATCH | `/reference/sglg-indicators/:id` | SUPER_ADMIN | Update an SGLG indicator |
| DELETE | `/reference/sglg-indicators/:id` | SUPER_ADMIN | Deactivate an SGLG indicator (`isActive = false`) |

### SDG Goals

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/sdg-goals` | Authenticated | Active SDG goals (UN 2030 Agenda) |
| GET | `/reference/sdg-goals/all` | SUPER_ADMIN | All SDG goals including inactive |
| POST | `/reference/sdg-goals` | SUPER_ADMIN | Create an SDG goal |
| PATCH | `/reference/sdg-goals/:id` | SUPER_ADMIN | Update an SDG goal (name / `isActive` only — the code is immutable) |
| DELETE | `/reference/sdg-goals/:id` | SUPER_ADMIN | Deactivate an SDG goal (`isActive = false`) |

Codes are zero-padded (`SDG-01 … SDG-17`) so the list's `code asc` ordering is
numeric. Unlike SGLG there is no edition-year dimension, so the list takes only
`isActive`.

### Climate Typology Codes

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/reference/climate-typology-codes` | Authenticated | Active CCET climate typology codes |
| GET | `/reference/climate-typology-codes/all` | SUPER_ADMIN | All climate codes including inactive |
| POST | `/reference/climate-typology-codes` | SUPER_ADMIN | Create a climate typology code |
| PATCH | `/reference/climate-typology-codes/:id` | SUPER_ADMIN | Update a climate typology code |
| DELETE | `/reference/climate-typology-codes/:id` | SUPER_ADMIN | Deactivate a climate typology code (`isActive = false`) |

## Reference data catalog

| Table | Source | Management | Reseeded |
|---|---|---|---|
| `PAPSector` | DBM BOM Annex 2 | CRUD via control panel + seed | Rare |
| `Office` | The LGU's AIP coding sheet (`prisma/data/<city folder>/offices.json`) | CRUD via control panel + seed | When the city reissues codes |
| `UACSObject` | DBM UACS catalog | CRUD via control panel + seed | Annually |
| `ClimateTypologyCode` | Local CCET typology — CCC LGU training manual under JMC 2015-01 ([`ccet-typology-local.md`](../design/ccet-typology-local.md)) | CRUD via control panel + seed; codes dropped from the JSON are deactivated, not deleted | When revised |
| `SGLGIndicator` | DILG SGLG framework | CRUD via control panel + seed | Annually |
| `SDGGoal` | UN 2030 Agenda (17 goals) | CRUD via control panel + seed | Never (fixed until 2030) |
| `CivilSocietyOrganization` | SUPER_ADMIN-assigned | CRUD via control panel | On CSO onboarding |
| `Cluster`, `FinishLine` | The LGU's strategic plan | Control panel + seed | Rare |
| `SubFinishLine` | The LGU's strategic plan | CRUD via control panel + seed | Rare |

Seed data files live in `api/prisma/data/` as JSON, loaded idempotently (upsert
by `code`). Deprecated records get `isActive = false` rather than being deleted.

**Offices reconcile by acronym, and are never wiped** — they carry nine inbound
foreign keys. `offices.json` is transcribed from the city's AIP coding sheet;
`RENAMED_ACRONYMS` in `prisma/seed.ts` maps the acronyms the sheet renamed
(`IAS → NCIASO`, `CHO 1 → CHO`, …) so the existing row is updated in place and
its users and programs follow. Offices absent from the sheet keep their rows.
`prisma/data/offices.check.ts` asserts that mapping — run it with
`npx tsx prisma/data/offices.check.ts`.
Full catalog detail: [`api/docs/aip-reference.md` §8](../../api/docs/aip-reference.md).

## Terminology caution

`Cluster` (strategic grouping, formerly `Sector`) is **not** `PAPSector` (the
DBM 4-digit expenditure classification). See the terminology pitfalls in
[`api/docs/aip-reference.md` §2](../../api/docs/aip-reference.md).

## Services

- **`ReferenceService`** — bulk reads and the `SUPER_ADMIN` curation methods for
  LGU-local rows.

## Tables touched

`Cluster`, `FinishLine`, `FinishLineCluster`, `SubFinishLine`,
`Office`, `CivilSocietyOrganization`, `PAPSector`,
`UACSObject`, `SGLGIndicator`, `ClimateTypologyCode`.

## Dependencies

`PrismaService`. Read-heavy endpoints may be cache-backed via
[`CacheService`](cache-redis.md).

## Related

- [data-model.md](../architecture/data-model.md) — how reference tables relate
- [aip-codes.md](aip-codes.md) — consumes PAP sector and office data for codes
