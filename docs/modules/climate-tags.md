# Module: `climate-tags`

**Folder:** `api/src/climate-tags/`

## Purpose

Manages the optional `ClimateChangeTag` — Climate Change Expenditure Tagging
(CCET) per DBM–CCC JMC 2015-01. A tag sits on **exactly one** of a
Project/Activity or a Program, and carries **any number** of CCET codes.

```
Program ──0..1── ClimateChangeTag ──0..n── ClimateChangeTagCode ── ClimateTypologyCode
   PA ──0..1──┘        (CHECK: exactly one owner)
```

Program-level tags exist because the city's AIP tags programs that state their
own costs (ENRO `10. Mt. Isarog…`) and parent rows (HSDO `11.`).

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| PUT | `/project-activities/:paId/climate-tag` | `aip:write` | Upsert the tag on a PA |
| DELETE | `/project-activities/:paId/climate-tag` | `aip:write` | Remove it |
| PUT | `/programs/:programId/climate-tag` | `aip:write` | Upsert the tag on the program itself |
| DELETE | `/programs/:programId/climate-tag` | `aip:write` | Remove it |

`PUT` replaces the tag's codes with the ones sent. Owner and editable-status
checks are the same as for any program edit.

## What a tag carries

- `codes` — 0..n `ClimateTypologyCode`s. The catalog is the **local** CCET
  typology ([`ccet-typology-local.md`](../design/ccet-typology-local.md)).
- `ccaAmount` (adaptation) and `ccmAmount` (mitigation), pesos.
- Optional `remarks` (the seed records the workbook's own code text here).

## Rules

| Rule | Where |
|---|---|
| `ccaAmount + ccmAmount ≤` the row's proposed budget (a PA's `proposedBudget`, else Σ line items; a program's `proposedTotal`) | `climateBudgetBasis`, on save and on line-item change |
| An amount with **no code** is allowed but blocks publishing (`INCOMPLETE_DATA`), derived — adding a code clears it | `program-publish.service.ts` `readinessFor` |
| Climate spending above the row's amount (imported as stated) is an advisory warning | `climateWarnings` in `import-data-warnings.ts` |

## Exports

`export-rows.ts` prints every code of a tag (`M114-04, M114-01`), adds a
program's own tag to its row, and totals a program from its **root** PPA rows
only — each already carries its subtree, so a nested tag is counted once.

## DTOs

`UpsertClimateTagDto` (`ccetCodeIds: string[]`, `ccaAmount`, `ccmAmount`, `remarks`).

## Tables touched

`ClimateChangeTag`, `ClimateChangeTagCode`, `ClimateTypologyCode`,
`ProjectActivity`, `Program`, `LineItem`.

## Related

- [project-activities.md](project-activities.md), [programs.md](programs.md)
- [reference.md](reference.md) — the CCET code catalog
