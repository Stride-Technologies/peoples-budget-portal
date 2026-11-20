# API — People's Budget Portal

The NestJS backend for the People's Budget Portal. It owns all business logic, auth,
and persistence; the [client](../client) talks to it over `/api/v1`.

- **Stack:** NestJS 11, Prisma 7, PostgreSQL, Redis, RS256 JWT auth (ESM).
- **Local port:** 8000. Swagger UI at `http://localhost:8000/api/v1/docs`.

## Running it

From the repo root:

```bash
pnpm install                              # install workspace deps
pnpm dev:api                              # start in watch mode on :8000
pnpm --filter api db:migrate              # apply migrations + regenerate the Prisma client
pnpm --filter api exec prisma db seed     # seed reference data + the first admin
```

See the root [`README.md`](../README.md) for the full script list.

## Documentation

| For… | See |
|---|---|
| How the API is built — architecture, data model, workflow | [`docs/architecture/`](../docs/architecture/overview.md) |
| Per-module reference (every NestJS module) | [`docs/modules/`](../docs/modules/README.md) |
| Domain reference — glossary, invariants, RBAC, AIP codes | [`docs/aip-reference.md`](docs/aip-reference.md) |
| The full HTTP route list (auto-generated) | [`docs/api-routes.md`](docs/api-routes.md) |
| Backend conventions — modules, Prisma, decimals, transactions, auth | [`AGENTS.md`](AGENTS.md) |

## Conventions

`api/AGENTS.md` is the authoritative guide for working in this workspace —
module layout, the Prisma v7 import path, decimal handling, transactions, auth
and RBAC, error handling, seeding, and the pre-PR checklist.
