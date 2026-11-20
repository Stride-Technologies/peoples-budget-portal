# People's Budget Portal: Agent Guide

A pnpm monorepo with two workspaces: a **NestJS 11 API** (`api/`, port 8000) and a **Next.js 16
client** (`client/`, port 3000). LGU staff encode and publish the AIP (Annual Investment Program),
the budget and procurement plans; residents read them and send feedback on a public site. One
deployment serves one LGU, named by the `LGU_*` settings. Programs follow the **publish model**:
DRAFT → PUBLISHED ⇄ PUBLISHED_REVISION.

**Before changing code, read [`ARCHITECTURE-ESSENTIALS.md`](ARCHITECTURE-ESSENTIALS.md).**
`CLAUDE.md` loads it automatically.

## Read these first

| If you're… | Read |
|---|---|
| Getting oriented | [`README.md`](README.md) → [`PRODUCT.md`](PRODUCT.md) → [`SPEC.md`](SPEC.md) |
| Planning a feature | [`FEATURES.md`](FEATURES.md), then the issue |
| Touching `api/**` | [`api/AGENTS.md`](api/AGENTS.md), [`api/docs/aip-reference.md`](api/docs/aip-reference.md), `docs/modules/<module>.md` |
| Touching `client/**` | [`client/AGENTS.md`](client/AGENTS.md), [`DESIGN.md`](DESIGN.md) for anything public-facing |
| Touching Docker, nginx, env vars | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/deployment.md`](docs/deployment.md), [`docs/configuration.md`](docs/configuration.md) |
| Touching auth, data, uploads, secrets | [`SECURITY.md`](SECURITY.md) |
| Changing the schema | `api/prisma/schema.prisma` (source of truth), [`docs/architecture/data-model.md`](docs/architecture/data-model.md) |
| Looking up a route | [`api/docs/api-routes.md`](api/docs/api-routes.md) (generated) |
| Writing user-facing help | [`docs/manual/`](docs/manual/README.md) |

## Repo layout

```
api/                 NestJS + Prisma 7 (schema, migrations, seeds in api/prisma/)
client/              Next.js 16: not the Next.js you know; read client/AGENTS.md
docs/                Quick start, deployment, configuration, architecture, modules, manual
deploy/, nginx/, docker-compose.yml   The production stack
docker-compose.dev.yml                Postgres for a laptop
services/inference/  Optional model sidecar for the Data Explorer
tools/               Route generator, docs → PDF, translation drafts
```

## Commands

```bash
pnpm install                              # Install workspace deps and git hooks
pnpm dev:api                              # NestJS on :8000 (Swagger at /api/v1/docs)
pnpm dev:client                           # Next.js on :3000
pnpm --filter api db:migrate              # Apply pending migrations + regenerate the client (development)
pnpm --filter api exec prisma migrate deploy    # Apply pending migrations only (CI, production)
pnpm --filter api db:seed:city            # Load a city folder into an EMPTY database (default: the sample city)
pnpm --filter api db:seed:city -- --dir <folder> [--draft]
pnpm --filter api exec prisma db seed     # Reseed reference data only (idempotent upserts; SEED_CITY_DIR)
pnpm --filter api db:seed:aip             # One year's AIP from JSON (AIP_SEED_YEAR, AIP_SEED_FILE)
pnpm --filter api db:check:sample-city    # Prove the sample city names no place
pnpm --filter api db:seed:tags -- --dry-run   # Create only the missing thematic tags
pnpm --filter api test                    # API unit tests (jest)
pnpm --filter client test                 # Client unit tests (node --test)
python3 -m unittest discover -s services/hearings   # Hearings pipeline tests (standard library, no model)
pnpm --filter api exec tsx prisma/publish-cycle.ts --year 2027 --dry-run   # Publish every ready program in a year
pnpm --filter api db:seed:document -- --year <fy> --book <json> [--dry-run]   # An enacted budget from a book file (one city's layout: docs/loading-your-data.md)
pnpm --filter api db:verify:document -- --year <fy>                           # Its totals against the book
pnpm translate                            # Draft Filipino and Bikol for new or changed public copy (needs a model endpoint)
pnpm docs:routes                          # Regenerate api/docs/api-routes.md from controllers
pnpm docs:pdf                             # Render docs/ to docs/dist/*.pdf
```

## Conventions that apply everywhere

- **TypeScript:** strict; `.js` extension on local imports (NestJS ESM); `import type` for type-only imports.
- **Money:** Prisma `Decimal(18, 2)`. **Never coerce to `Number`** — use Decimal methods (`.plus`, `.minus`, `.mul`, `.div`). Decimals travel as strings; clients use a decimal library.
- **Prisma client import:** `import { … } from '<rel>/generated/prisma/index'` — the subpath, never the bare directory or `@prisma/client`.
- **Hooks:** pre-commit runs lint + `tsc` for both workspaces and regenerates `api-routes.md`; pre-push runs `pnpm audit` and both test suites.
- **Prose:** diagram-heavy and concise. Public-facing text (privacy policy, help) in plain language — no jargon, nothing intimidating.
- **Copy names no place and no kind of LGU.** Use the slots (`{placeName}`, `{lgu}`, `{lguAdj}`,
  `{council}`, `{Mayor}`, `{Goals}`) in messages, `<LguWord>` and `<BrandText>` in components,
  `getBrand()` in the API. `client/src/i18n/catalogue.test.ts` fails on a bare "city".

## Data and AI agents

Budget data (programs, amounts, published figures) is public record and may be read by AI agents.
**Personal data may not**: user accounts and e-mails, feedback submitters' names and contacts,
comment authors, audit logs, tokens. Concretely: `users`, `user_*`, `lgu_users`, `ncpc_users`,
`email_verifications`, `refresh_tokens`, `password_reset_tokens`, `public_registry_feedback`,
`ppmp_feedback`, `program_comments`, `ppmp_comments`, `program_audit_logs`, and the Data Explorer's
`explorer_questions`, `explorer_model_calls`, `explorer_feedback` and `explorer_training_questions`.
When checking a database, select budget columns, not personal ones. See
[`SECURITY.md`](SECURITY.md#personal-data-in-the-database).

## About `specs/NNN`

Comments and docs cite feature specs (`specs/012`) from the portal's first deployment. They are not
in this repository. The rule written beside the citation is what matters.

## Doc freshness

Stale docs are bugs. In the same pull request as the change:

| You changed… | Update |
|---|---|
| A controller | nothing: the pre-commit hook regenerates `api/docs/api-routes.md` |
| A schema invariant, RBAC rule, AIP code format, glossary term | `api/docs/aip-reference.md` |
| A module's endpoints, services or behaviour | `docs/modules/<module>.md` |
| The data model or a lifecycle | `docs/architecture/` |
| Anything a user sees | `docs/manual/` |
| A feature's status | `FEATURES.md` |
| A setting | `docs/configuration.md` and both example env files |
| Something a deployment must do when updating | `CHANGELOG.md` |
| An invariant that bit you | `ARCHITECTURE-ESSENTIALS.md` |
| A security control or gap | `SECURITY.md` |
