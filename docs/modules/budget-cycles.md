# Module: `budget-cycles`

**Folder:** `api/src/budget-cycles/` · **Spec:** `specs/012-budget-cycle-model` · ADR [0002](../adr/0002-budget-cycle-wraps-aip-cycle.md)

## Purpose

A **Budget Cycle** is one fiscal year's whole budget — consultations, the AIP, the
LEP, the Ordinance, execution (see [`CONTEXT.md`](../../CONTEXT.md)). The AIP is one
stage of it: `BudgetCycle` wraps the year's `AIPCycle` 1:1 (optional, so a historical
year can hold an Ordinance alone). This module owns the cycle's **stage** and the
**public sections rule**.

```
BudgetCycle (fiscalYear, currentStage 0–9, alongsideStages)
  └── AIPCycle 0..1  PLANNING → OPEN → CLOSED → ADOPTED      (aip-cycles module)
  └── LEP / Ordinance documents                              (specs/012 P1+)
```

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/budget-cycles` | `cycles:read` | List budget cycles, newest first, with their AIP stage's status |
| GET | `/budget-cycles/:id` | `cycles:read` | One budget cycle |
| PATCH | `/budget-cycles/:id/stage` | SUPER_ADMIN, `cycles:write` | `{ currentStage, alongsideStages }` (0–9). Execution (8) or later → 409 `STAGE_REQUIRES_ENACTED_ORDINANCE` unless the year has an enacted budget |

The stage drives the public home page's "where we are" note and `/learn` (`liveBudgets`
in `client/src/lib/budget-cycle.ts`). Staff set it in the control panel on the AIP
cycle page ("Budget stage").

## Sections rule (`cycle-sections.ts`)

`computeSections` decides which public sections a year is in; `loadCycleSections`
runs it for every cycle in two queries. Used by `GET /public/cycles` (`sections`),
`GET /aip-cycles/:id`, and open data's `documentOf`. The client never re-derives it.

| Year | `sections` |
|---|---|
| AIP being prepared (PLANNING/OPEN/CLOSED) | `['aip']` |
| AIP adopted, something public | `['aip']` |
| AIP adopted, nothing public | `[]` |
| Enacted Ordinance + public AIP | `['aip', 'annual']` |
| Enacted Ordinance, no AIP | `['annual']` |
| FY2026 (interim, until its Ordinance is enacted; removed in P8) | `['annual']` |

## Creating cycles

Anything that creates an AIP cycle goes through `createAipCycle` (`ensure-budget-cycle.ts`):
it upserts the year's Budget Cycle and gives the AIP cycle the same id when free, so
public `cycleId`s stay one id space. Code still reaches one from the other through the
relation, never by assuming the ids are equal.

## Tables

`budget_cycles` (CHECK 0–9 on stages); `aip_cycles.budget_cycle_id` (unique FK).
