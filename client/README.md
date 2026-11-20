# Client — People's Budget Portal

The Next.js 16 frontend for the People's Budget Portal. It renders the UI and
brokers every call to the [API](../api); it holds no business logic.

- **Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind
  CSS v4, shadcn/ui.
- **Local port:** 3000. Expects the API on port 8000.

> Next.js 16 has breaking changes from earlier versions — see [`AGENTS.md`](AGENTS.md).

## Running it

From the repo root:

```bash
pnpm install        # install workspace deps
pnpm dev:client     # start the dev server on :3000
```

The API must also be running (`pnpm dev:api`).

## Documentation

| For… | See |
|---|---|
| The client architecture — routing, server actions, sessions, SSE | [`docs/architecture/frontend.md`](../docs/architecture/frontend.md) |
| How the portal is used (by role) | [`docs/manual/`](../docs/manual/README.md) |
| Backend domain context — terminology, RBAC, endpoints | [`api/docs/aip-reference.md`](../api/docs/aip-reference.md) |
| Frontend conventions — layout, forms, terminology, shipping checklist | [`AGENTS.md`](AGENTS.md) |

## Conventions

`client/AGENTS.md` is the authoritative guide for working in this workspace.
