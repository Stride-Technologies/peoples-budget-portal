# API — Agent Guide

NestJS 11 on Node 20+, Prisma 7 against PostgreSQL (Supabase), RS256 JWT auth, ESM (`.js` extensions on local imports).

This file covers conventions specific to `api/`. For monorepo conventions, see [`../AGENTS.md`](../AGENTS.md). For AIP domain reference (glossary, invariants, RBAC), see [`docs/aip-reference.md`](docs/aip-reference.md). For per-module reference (purpose, endpoints, services, diagrams), see [`../docs/modules/`](../docs/modules/README.md). For the current route list, see [`docs/api-routes.md`](docs/api-routes.md) (auto-generated).

## Module layout

Every feature is a single folder under `src/`:

```
src/<feature>/
├── <feature>.controller.ts   HTTP route handlers + Swagger metadata
├── <feature>.service.ts      Business logic, transactional boundaries
├── <feature>.module.ts       @Module declaration; imports/exports
└── dto/                      class-validator-decorated request DTOs
```

For features that grow more than one service (e.g., `programs/`), split by concern:
- `programs.service.ts` — CRUD + RBAC helpers
- `program-workflow.service.ts` — status transitions, endorsements, verdicts
- `program-versions.service.ts` — JSON snapshot + side-by-side compare

Cross-cutting services that have no controller (e.g., `BudgetRollupService`, `AIPCodesService`) live in their own module and are imported wherever needed.

Current modules (each registered in `src/app.module.ts`):

- **Foundational**: `auth`, `users`, `prisma`, `mail`, `health`, `common`, `cache` + `redis` (JSON cache facade + pub/sub), `events` (SSE activity nudges)
- **AIP reference data**: `reference` (extended with PAPSector, Office, UACSObject, SGLGIndicator, ClimateTypologyCode, SDGGoal)
- **AIP infrastructure**: `aip-cycles`, `budget-ceilings`, `aip-codes`, `budget-rollup`
- **AIP core**: `programs`, `project-activities`, `line-items`, `climate-tags`, `comments`, `aip-registry`, `lfc` (LFC sequential approval gate + Approver view)
- **Public**: `public` (unauthenticated registry browse + anonymous feedback)
- **Admin**: `admin` (public-feedback moderation + drift-repair: `POST /admin/recompute-rollups/:programId`)

## Prisma v7 specifics

```ts
// ✅ Correct import path — subpath of the generated client
import { Prisma, ProgramStatus, Role } from '../generated/prisma/index';

// ❌ Don't do this — bare directory or @prisma/client
// import { ... } from '../generated/prisma';
// import { ... } from '@prisma/client';
```

The client is generated to `src/generated/prisma/`. Regenerate via `pnpm --filter api db:generate` (or `prisma generate`). Migrations live in `prisma/migrations/`.

### Migration workflow

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma validate` to check syntax.
3. Run `npx prisma migrate dev --create-only --name <descriptive_name>` to scaffold the SQL.
4. **Hand-review the generated SQL** — destructive changes (DROP, CREATE without preserving data) on populated tables must be rewritten as `ALTER TABLE ... RENAME` or with explicit data migration steps.
5. Apply with `npx prisma migrate deploy` (or `dev` if you want auto-reset).
6. Update [`docs/aip-reference.md`](docs/aip-reference.md) if the change touches a documented invariant.
7. Update the affected page under [`../docs/modules/`](../docs/modules/README.md) (and `../docs/architecture/data-model.md` for schema changes).

### Decimals

Every monetary column uses `@db.Decimal(18, 2)`. Quantities use `Decimal(14, 2)`.

```ts
// ✅ Operate on Prisma.Decimal directly
const lineTotal = quantity.mul(unitCost);
const sum = items.reduce((acc, i) => acc.plus(i.lineTotal), new Prisma.Decimal(0));

// ❌ Never coerce to Number — float drift will corrupt accounting
// const lineTotal = Number(quantity) * Number(unitCost);
```

DTOs accept decimals as strings matching `/^\d+(\.\d{1,2})?$/` — this preserves precision through JSON. Convert with `new Prisma.Decimal(dto.value)` at the service boundary.

### Transactions

Any mutation that touches more than one table — or that must remain consistent with a denormalized rollup — uses `prisma.$transaction(async (tx) => { ... })`. Pass `tx` into helper services so they participate in the same transaction:

```ts
await this.prisma.$transaction(async (tx) => {
  const li = await tx.lineItem.create({ ... });
  await this.rollup.recomputeProjectActivity(paId, tx);   // ← participates in tx
  await this.assertClimateTagWithinBudget(paId, tx);
});
```

`BudgetRollupService` is the canonical example of a cross-cutting transactional service.

## Auth & RBAC

- `JwtGuard` is globally registered (`APP_GUARD` in `app.module.ts`). All routes require a Bearer token unless decorated with `@Public()`.
- `RolesGuard` is also global. Decorate routes with `@Roles(Role.SUPER_ADMIN, Role.HEAD, ...)` to restrict.
- `@CurrentUser()` injects `JwtPayload` (`sub`, `role`, `email`, `cityOfficeId`, `civilSocietyOrganizationId`, `identityType`).
- RBAC matrix for the AIP domain is in [`docs/aip-reference.md`](docs/aip-reference.md) §5.
- Service-layer RBAC helpers live in `programs.service.ts`: `assertOwner`, `assertOwningHead`, `assertCanRead`, `buildVisibilityWhere`. Reuse these from any service that needs program-visibility logic.

## Errors

Throw NestJS exceptions; the global `HttpExceptionFilter` (in `src/common/filters/`) normalizes them:

- `BadRequestException` — validation failures, malformed transitions
- `ForbiddenException` — RBAC denials
- `ConflictException` — state conflicts (e.g., ceiling exceeded, duplicate)
- `NotFoundException` — missing entities

For ceiling-exceeded conflicts and similar structured errors, pass an object payload (see `program-workflow.service.ts` `assertCeilingHonored`).

## Soft delete

Only `Program` is soft-deleted (`deletedAt: DateTime?`). All program reads filter `deletedAt: null`. `ProjectActivity` and `LineItem` are hard-deleted, and only while the parent program is in `DRAFT`. See [`docs/aip-reference.md`](docs/aip-reference.md) §10 for the rationale.

## Seeding

`prisma/seed.ts` is idempotent (upserts by `code`). It seeds:

1. The first SUPER_ADMIN from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env vars.
2. Clusters and finish lines.
3. Offices, from `prisma/data/<city folder>/offices.json` (the city's AIP coding sheet), reconciled **by acronym and updated in place** — never wiped, since offices carry nine inbound FKs. `RENAMED_ACRONYMS` maps acronyms the sheet renamed so the existing row survives with its id. Offices absent from the sheet are left alone.
4. AIP reference data (PAPSectors, UACSObjects, ClimateTypologyCodes, SGLGIndicators, SDGGoals) — upsert-only.

When extending, prefer **upsert by `code`** to keep reruns safe. Wipe-and-recreate is acceptable only for tables with no inbound FKs.

### Name casing

`titleCaseName` in `src/common/title-case-name.ts` is a **deliberate mirror** of `client/src/lib/utils.ts` — there is no shared workspace, so the function exists twice and the *same* case table runs against both (`title-case-name.spec.ts` / `utils.test.ts`). Edit both copies together, especially `TITLE_ACRONYMS`: an acronym added on one side only comes out mangled on the other. The 2027 import applies it via `isShoutedName`, which normalizes a heading shouted throughout but never touches a name with a properly-written word in it.

### One-off data repairs

`prisma/repair-aip-2027.ts` (`pnpm --filter api db:repair:2027`) is the pattern for fixing already-seeded rows: **always support `--dry-run`**, and implement it by doing the real writes inside a transaction and throwing to roll back — a separate "preview" code path predicts what would happen, a rolled-back transaction reports what did. Never write a tentative AIP code directly; call `AIPCodesService.resyncTentativeProgramCodes` (`docs/aip-reference.md` §7). The resync takes `{ force: true }` for the two cases where there is no existing code to protect — a format restatement, and a snapshot restore that rebuilt the PA subtree onto sentinels — which is still going through the service, not around it.

## Test pattern

Tests live in `src/**/*.spec.ts` (unit) and `test/**/*.e2e-spec.ts` (e2e). `jest` is configured in `package.json`. The current AIP modules have minimal unit coverage; **integration coverage is a known follow-up**.

## Operational commands

```bash
pnpm --filter api dev                     # nest start --watch
pnpm --filter api build                   # nest build
pnpm --filter api lint                    # eslint --fix
pnpm --filter api exec tsc --noEmit       # static typecheck
pnpm --filter api test                    # jest
pnpm --filter api db:migrate              # prisma migrate dev
pnpm --filter api db:generate             # prisma generate
pnpm --filter api exec prisma migrate deploy   # production-style apply
pnpm --filter api exec prisma migrate status   # show pending
pnpm --filter api exec prisma db seed     # run seed.ts
```

## When you ship something AIP-related

Walk through this checklist before opening a PR:

- [ ] Schema changes have a hand-reviewed migration SQL (no destructive DROP on populated tables).
- [ ] Service mutations are wrapped in transactions where they cross tables.
- [ ] Decimal columns are operated on as `Prisma.Decimal`, not `Number`.
- [ ] New routes have `@ApiOperation` Swagger metadata.
- [ ] RBAC is enforced at the service layer (not just guards) for owner/peer/endorser distinctions.
- [ ] [`docs/aip-reference.md`](docs/aip-reference.md) reflects any new invariant or RBAC rule.
- [ ] The affected page under [`../docs/modules/`](../docs/modules/README.md) reflects new or changed endpoints, services, or behaviour.
- [ ] [`docs/api-routes.md`](docs/api-routes.md) is regenerated (the pre-commit hook does this automatically).
