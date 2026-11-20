# Complete AIP export (.xlsx)

Status: shipped — `GET /aip-registry/exports/complete`. Module reference: [`docs/modules/aip-registry.md`](../modules/aip-registry.md).

## Why

The portal exports **one cluster at a time** (`GET /aip-registry/exports/cluster`).
The budget office's actual working document is the whole city in one workbook —
`EXPEN_AIP <FY>.xlsx`, maintained by hand. This adds that export so the city-wide
document comes out of the portal instead of a spreadsheet.

`GET /aip-registry/exports/complete?cycleId=…` → 7 sheets:

```
Export Info      ─ cover: generated when / by whom / from what office, coverage,
                   per-sheet totals, and how to read the numbers
Executive Summary ─ this year's "Comparative": per sector, each office's
                   PS/MOOE/CO/Total and share; then sectors vs the city
GENERAL PUBLIC ─┐
ECONOMIC        ├─ one per AipSectorGroup: offices → papClass → program/PA rows
ENVIINFRA       │
SOCIAL         ─┘
Fund Source      ─ PS/MOOE/CO/Total per funding source, per group + SUMMARY
```

**Executive Summary** is the reference workbook's `Comparative V3` sheet for the
budget year alone, and with the rest of the workbook it serves as the DBM-compliant
AIP document for P3 (#96). Kept: the four office-by-sector blocks (PS / MOOE / CO /
Total / % of sector) and the sector summary (% of the city). Dropped: the 2026
columns (`AC:AH`), the 2027-vs-2026 `% change` table, the legacy V1 layout in
`A:T`, and the funding-source summary, which is the `Fund Source` sheet. Total is
the proposed budget, as everywhere in this export, so PS + MOOE + CO can be less
than it (see *Export Info*). Values, not formulas into the sector sheets.

## Three gaps between the reference workbook and the schema

### 1. The four sector groups are not derivable

Only three `PAPSector`s are in use (1000 → 40 offices, 3000 → 9, 8000 → 14) and
`Cluster` has eight values. The workbook's split cuts across both — CPRFMO is
sector 1000 but files under ENVIINFRA; NCGH and OLLI are 8000 but file under
SOCIAL.

→ `enum AipSectorGroup` + **nullable** `Office.aipSectorGroup`. Null is the normal
state: `resolveSectorGroup` derives the group from the office's sector, so a newly
added office is never dropped. The column records only the nine exceptions.

```
papSector 1000, 9000        → GENERAL_PUBLIC
papSector 3000, 4000, 5000  → SOCIAL
papSector 6000, 8000        → ECONOMIC
no sector at all            → GENERAL_PUBLIC
```

| Override | sector | fallback would say | files under |
|---|---|---|---|
| CENRO, SWMO, CEO | 8000 | ECONOMIC | `ENVI_INFRA` |
| CPRFMO | 1000 | GENERAL_PUBLIC | `ENVI_INFRA` |
| NCGH, OLLI | 8000 | ECONOMIC | `SOCIAL` |
| OSCA, PDAO | 1000 | GENERAL_PUBLIC | `SOCIAL` |
| NCCDO | 1000 | GENERAL_PUBLIC | `ECONOMIC` |

The set is pinned in `prisma/data/offices.check.ts` — an override quietly added or
dropped moves an office's money to another sheet without changing the city total,
so sheet totals alone would not catch it.

### 2. Funding sources carry no amounts

`ProjectActivity.fundSources` is an amount-less `FundSource[]` **by design** (see
the enum's doc comment): the budget office lists the funds a PPA draws on, it does
not split the estimate across them. FY2027 data:

| cited sources | PAs |
|---|---|
| exactly one | 1,285 |
| two or more | 41 |
| none | 526 |

→ Attribute the **full amount to the sole cited source** — exact for 1,285 of the
1,326 sourced PAs. The 41 multi-source PAs go to a `MULTIPLE SOURCES` row rather
than being split evenly, which would fabricate precision the data does not have.
Unsourced PAs default to `GF`, matching the cluster export's `DEFAULT_FUNDING_SOURCE`.

### 3. Prior-year comparison

Dropped. FY2026 is seeded (`seed-ab-2026.ts`, 39 office sheets with PS/MOOE/CO) so
it remains buildable later, but it is not part of this change.

## Decisions

- **No .xlsx template.** The cluster export drives a committed template and pays
  for it with `duplicateRow` style-sharing bugs and reach-ins to ExcelJS's private
  `_merges`. These sheets are a plain 14-column grid — build them directly.
- **City-wide only.** A "complete AIP" scoped to one office is a lie; require
  `ALL_OFFICES` scope, else 403.
- **Group by `hostOfficeId ?? officeId`** — component programs print under their
  host office's sheet, which is what `hostOfficeId` is for.
- **Scope: everything non-deleted in the cycle**, no status filter — same rule as
  the cluster export, so drafts are included and the export is useful mid-cycle.
- Sheet names keep the reference's short forms, which the budget office reads.
- Money in **million pesos**, 6 d.p. retained, displayed `0.00` — same as the
  cluster export. Never `SUM(H:J)` for a row total: most rows carry only
  `proposedBudget` with no per-class split.

## Layout

```
A AIP Reference Code   B Description   C Implementing Office   D From   E To
F Expected Outputs (Results)   G Funding Source
H PS   I MOOE   J Capital Outlay   K Total
L Climate Change Adaptation   M Climate Change Mitigation   N CC Typology Code

row 1  "<FY> ANNUAL INVESTMENT PLAN"
row 2  "<group label>"
row 3  header                                  ← freeze at A4
       per office, ordered by (officeType, officeCode) nulls last:
         <OFFICE NAME>
           GENERAL ADMINISTRATIVE SERVICES     ← papClass section
             program row (code + bold description, no amounts)
               project / activity rows
           SUPPORT TO OPERATIONS / OPERATIONS
         SUB-TOTAL, <ACRONYM>
         (blank)
       TOTAL
```

The reference repeats a fund-source block at the tail of each sector sheet; that
is the same data as the `Fund Source` sheet and is not reproduced.

## Colour

Two layers, so hue carries information rather than decorating.

**Chrome — constant on every sheet.** The frozen column header and the grand
`TOTAL` are slate `FF1E293B`. They mean the same thing everywhere, so tying them
to whichever sheet you are on would make the colour arbitrary. `Export Info` and
`Fund Source` wear the chrome too: neither is a sector.

**Hue — one per sector sheet.** Carried by the office bands, their subtotals, the
sheet's `A2` sector label, the matching Fund Source block, and the Excel **tab
colour**, which is the only sheet-level affordance a six-tab workbook has.

| Sector | Band | Subtotal tint |
|---|---|---|
| General Public | `FF1447E6` blue — the portal's own `--primary` | `FFDBE4FD` |
| Economic | `FFB45309` amber | `FFFDECD3` |
| Environmental & Infrastructure | `FF15803D` green | `FFD5F0DF` |
| Social | `FF7E22CE` purple | `FFEBDCF9` |

Semantic where it can be — environment green, social purple — and the portal
primary for General Public so the file still looks like it came from this
product.

**`papClass` headings keep the city's own `FFCCCCCC` grey.** They repeat inside
every office block on every sheet; colouring them would compete with the office
band directly above and add no information.

A band always spans the sheet's full width and is applied *after* the row's
values, so empty cells are filled too — a fill that stops at the last written
cell reads as a ragged stripe. Arial throughout, as the city's workbook is;
sizes are scaled for screen rather than copied from a file typeset for
large-format printing.
