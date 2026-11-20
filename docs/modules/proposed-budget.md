# Proposed Budget Field — Implementation Notes

## Overview

Project/Activity (PA) forms no longer require `expectedOutput` or line items. A new `proposedBudget` field accepts a single lump-sum amount directly, which is what the 2027 AIP shortlisted PAPs spreadsheet uses.

## What Changed

### Data Model

`ProjectActivity` gained one new column and one relaxed constraint:

| Column | Type | Change |
|---|---|---|
| `proposed_budget` | `DECIMAL(18,2) NULL` | New — stores user-entered lump sum |
| `expected_output` | `TEXT NULL` | Was `NOT NULL`; now optional |

Migration: `20260618173637_add_proposed_budget_optional_expected_output`

### Backend

**DTOs** (`api/src/project-activities/dto/`)
- `expectedOutput` — `@IsString() @Length(10,2000)` → `@IsOptional() @IsString() @Length(1,2000)`
- `proposedBudget` — new optional field, validated as a decimal string (`/^\d+(\.\d{1,2})?$/`)

**Service** (`api/src/project-activities/project-activities.service.ts`)
- `create`: stores `proposedBudget` as `new Prisma.Decimal(dto.proposedBudget)` when provided
- `update`: patches `proposedBudget` when present in the DTO (can be set to `null` to clear)

**Public endpoint** (`api/src/public/public.service.ts`)
- Returns a single `proposedAmount` field instead of the full `psTotal / mooeTotal / coTotal / grandTotal` breakdown
- `proposedAmount = proposedBudget ?? grandTotal` — falls back to the line-item computed total for PAs that still use the old line-item flow
- `lineItems` array is no longer included in the public PA response

### Client

**Zod schema** (`client/src/lib/schemas.ts`)
- `expectedOutput` — required with 10-char minimum → optional string, max 2000 chars
- `proposedBudget` — new optional field, regex-validated decimal string
- `superRefine` — removed the "at least 1 line item required" rule
- `AddProjectActivityFormValues` interface updated to match

**API client** (`client/src/lib/api.ts`)
- `CreateProjectActivityPayload.expectedOutput` — `string` → `string | undefined`
- `CreateProjectActivityPayload.proposedBudget` — new optional string
- `UpdateProjectActivityPayload.expectedOutput` — `string | undefined` → `string | null | undefined`
- `UpdateProjectActivityPayload.proposedBudget` — new optional `string | null`
- `ProjectActivityDetailRecord.expectedOutput` — `string` → `string | null`
- `ProjectActivityDetailRecord.proposedBudget` — new `string | null`

**Form** (`client/src/components/project-activity/`)
- `project-activity-details-section.tsx` — `expectedOutput` label changed from required to optional
- `cost-budget-proposal-section.tsx` — `Proposed Budget` text input added above the line items section; line items remain visible as optional supporting detail
- `_actions.ts` — `proposedBudget` forwarded on both create and update; `expectedOutput` mapped to `undefined` when null
- `client/src/app/programs/[id]/add-project/_actions.ts` — same forwarding on the page-level action

## Budget Display Logic

| Condition | `proposedAmount` shown |
|---|---|
| `proposedBudget` is set | `proposedBudget` |
| `proposedBudget` is null | `grandTotal` (computed from line items) |

This is applied in the public endpoint only. Internal/authenticated endpoints still return `proposedBudget` alongside the full `psTotal / mooeTotal / coTotal / grandTotal` rollup so reviewers retain the breakdown when line items exist.

### Per-expense-class figures follow the same rule

The headline figure was switched to the proposed family, but the PS / MOOE / CO
cards below it were not — they kept reading the line-item rollups, which are
structurally `0` while line-item entry is deferred. Every public surface showed a
correct Proposed Budget above three ₱0.00 cards.

`publicExpenseClassAmount` / `snapshotExpenseClassAmount` in
`api/src/public/public.service.ts` now resolve each class the same way the
headline does:

| Level | Preferred (proposed) | Fallback (rollup) |
|---|---|---|
| Program | `psProposedTotal` / `mooeProposedTotal` / `coProposedTotal` | `psTotal` / `mooeTotal` / `coTotal` |
| ProjectActivity | `psEstimate` / `mooeEstimate` / `coEstimate` | `psTotal` / `mooeTotal` / `coTotal` |

A **zero** proposed value counts as absent, so the rollup can win once line items
exist. Applies to `GET /public/registry`, `/public/registry/:programId` (read out
of the published snapshot, hence the JSON variant) and
`/public/registry/:programId/project-activities/:paId`. Covered by
`api/src/public/public.service.spec.ts`.

Two client consequences:
- `BudgetCards` (`public-program-drawer.tsx`) divides the share bars by the
  displayed summary amount, not `grandTotal` — dividing by the zero rollup
  flattened every bar to 0%.
- The version-compare page (`program-compare-client.tsx`) reads
  `proposedTotal ?? grandTotal` and `proposedBudget ?? grandTotal` for the same
  reason.

A program whose PAs carry only a `proposedBudget` total and no per-class
estimates still shows ₱0.00 across all three cards — that is missing source
data, not a display bug.

## Playwright Import Notes

When scripting PA creation from the 2027 AIP spreadsheet:

1. Fill **Project / Activity Name** (required)
2. Fill **Proposed Budget** with the "Proposed AMT" column value as a plain decimal string, e.g. `200000.00`
3. **Expected Output** and **Line Items** can be left blank — the form will submit without them
4. Implementation period: fill Start and End from the spreadsheet's START / END columns (e.g. `Jan 2027` → month `1`, year `2027`)
