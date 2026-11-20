# Contributing

## Set up

Follow [`docs/quick-start.md`](docs/quick-start.md): Node 22 (`.nvmrc`), pnpm 10, Docker for the
database. `pnpm install` also installs the git hooks.

```bash
pnpm dev:api      # NestJS on http://localhost:8000, Swagger at /api/v1/docs
pnpm dev:client   # Next.js on http://localhost:3000
```

## How work flows

1. Open an issue first for anything larger than a small fix, so the approach can be agreed.
2. Branch from `main` as `type/short-description` (`feat/lep-comparison`, `fix/cycle-adopt-guard`).
3. Open a pull request with the template. Link the issue.
4. In the same pull request, update the docs the change touches: the table is in
   [`AGENTS.md`](AGENTS.md#doc-freshness).

## Checks

| When | Runs |
|---|---|
| pre-commit | Regenerates `api/docs/api-routes.md` when a controller is staged; warns when `schema.prisma` is staged without a migration; `eslint` and `tsc --noEmit` for both workspaces |
| commit-msg | `commitlint` |
| pre-push | `pnpm audit`, API tests (jest), client tests (`node --test`) |
| Pull request | The same checks, plus both builds (`.github/workflows/ci.yml`) |

Do not bypass the hooks with `--no-verify`. If one fails on something outside your change, say so
in the pull request.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): short description`.
A scope is required for `feat` and `fix`.

```text
feat(ppmp): add supporting-document upload
fix(aip-cycles): allow adopting a published cycle
docs: update the deployment guide
```

## Database changes

1. Edit `api/prisma/schema.prisma`.
2. `pnpm --filter api exec prisma migrate dev --create-only --name <name>`.
3. Read the SQL. No destructive change to a populated table without a data migration. Never edit a
   migration that has been released.
4. Apply it with `pnpm --filter api db:migrate`.
5. Update `docs/architecture/data-model.md`, and `api/docs/aip-reference.md` if an invariant changed.

## Copy

- Public text goes in `client/src/i18n/messages/en.json`, in plain language.
- Never write "city", "Mayor" or "Sangguniang Panlungsod" outright: use `{lgu}`, `{lguAdj}`,
  `{Mayor}` and `{council}`, so a municipality or a province reads right. A test fails otherwise.
- Changing an English string hides its translations until they are redone (`pnpm translate`, then a
  reviewer). That is by design.

## Data

Real budget files, anything with personal data, `.env` files and keys stay out of git. Do not paste
personal data into an issue, a pull request or an AI tool: see [`SECURITY.md`](SECURITY.md).

## Licence of contributions

By contributing you agree that your contribution is licensed under the AGPL v3, like the rest.
