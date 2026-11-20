<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Client — Agent Guide

Next.js 16 (App Router) on React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui on top of Base UI primitives. The client runs on port 3000 and talks to the NestJS API on port 8000.

For monorepo conventions, see [`../AGENTS.md`](../AGENTS.md). For the client architecture (routing, server actions, sessions, SSE), see [`../docs/architecture/frontend.md`](../docs/architecture/frontend.md). For backend domain context (terminology, RBAC, endpoint contract), see [`../api/docs/aip-reference.md`](../api/docs/aip-reference.md) and [`../api/docs/api-routes.md`](../api/docs/api-routes.md).

## Layout

```
client/
└── src/
    ├── app/                         App router pages (route segments map to folders)
    ├── components/
    │   ├── ui/                      shadcn/ui primitives — do not hand-edit; regenerated via shadcn CLI
    │   ├── custom/                  Project-specific generic components
    │   ├── aip/                     AIP registry components
    │   ├── project-activity/        Add Project/Activity form + sections
    │   ├── finish-lines/            Finish-line UI (program overview sidebar, etc.)
    │   └── …
    ├── lib/
    │   ├── schemas.ts               Zod schemas + TS types (form values & API shapes)
    │   ├── api.ts                   Real API client (typed fetch wrappers)
    │   ├── api-client.ts            Empty stub (mocks removed); real calls live in api.ts
    │   └── …
    ├── hooks/                       Custom React hooks
    └── types/                       Standalone TS types (e.g., budget.ts)
```

## Terminology

The backend uses these canonical names — use them in all new code:

- **FinishLine** (FL1–FL8): the strategic finish-line categories. `MOCK_CLUSTERS` in the old api-client was FinishLine data.
- **Cluster**: strategic groupings linked to FinishLines (was called `Sector` in early frontend code). All client types now use `clusterId` / `cluster` / `finishLineClusters`.
- **PAPSector**: DBM BOM Annex 2 program/activity/project sectors. `MOCK_SECTORS` (4-digit codes like `3000`) was PAPSector data.

See [`../api/docs/aip-reference.md`](../api/docs/aip-reference.md) §2 for the full glossary.

## Conventions

- **Form state**: react-hook-form + Zod resolver. The pattern is `useForm<TFormValues>(...)` with Zod schemas in `src/lib/schemas.ts`. Form values use string for monetary inputs (decimals serialized as strings — must match the API's `Decimal` contract).
- **shadcn components** live in `src/components/ui/`. To add a new one, use the shadcn CLI; do not hand-write. Custom variants belong in `src/components/custom/` or feature folders. **Local edits made on purpose** (re-apply these if the CLI regenerates the file):
  - `ui/dialog.tsx` caps `DialogContent` at `max-h-[calc(100dvh-2rem)] overflow-y-auto` — without it a tall dialog centred on `top-1/2` hangs off both edges of the viewport and its footer buttons are unreachable.
  - `ui/popover.tsx` sets `positionMethod="fixed"` on the Positioner. Base UI's `absolute` default portals the popup to the end of `<body>` as `top: 0` plus a transform; opening it moves focus into the popup and the browser scrolls the document to that untransformed box, throwing the page to the top (measured: `scrollY` 876 → 6.5 on the create-program finish-line field). Every popover-based dropdown — `SimpleSelect`, `OfficeCombobox`, `MultiSelectCombobox`, `MonthYearPicker` — was affected. `ui/select.tsx` does **not** have this bug; leave it on `absolute`.
- **Tailwind v4**: use the `cn()` helper from `src/lib/utils.ts` for conditional classes.
- **Remembered view preferences** (which tab, which filter chips, density) go in a plain cookie via `src/lib/filter-cookie.ts`, read by a thin **server** `page.tsx` and passed to the client component as `initialFilters` — see `src/app/aip-registry/`. Read server-side so the first paint is already filtered; never seed such state from `document.cookie` during render (the component prerenders, so it mismatches hydration). Sanitize every field on read: the cookie is user-writable and outlives the option sets it names. Auth stays in the httpOnly session cookies.
- **Unit tests** run on Node's built-in runner — `pnpm --filter client test` executes `src/**/*.test.ts` via `--experimental-strip-types`. No vitest/jest here on purpose; `.husky/pre-push` already calls the script. Pure helpers in `src/lib/` are the things worth covering (`titleCaseName` is the worked example); component behaviour belongs in the Playwright e2e suite.
- **Public copy is translated (specs/014)**: new text on the home page, an Overview or Learn goes in `src/i18n/messages/en.json` and is read with `getT()` (server) or `useT()` (client); a sentence with a link or emphasis inside is one message with a `{slot}`, rendered with `rich()`. Budget terms, office/PPA names and data are never translated. Link with `LocaleLink` and redirect with `localeRedirect`, or the visitor drops back to English. Then `pnpm translate` drafts Filipino and Bikol. See `docs/architecture/frontend.md` → Languages.
- **App router**: every page under `src/app/<route>/page.tsx`. Server components by default — `'use client'` only when needed (forms, state, browser APIs).
- **Money**: receive Decimal as `string` from the API. For arithmetic, use a Decimal library — do not coerce to `Number`.
- **Program status checks**: never hardcode a status list. Use `isEditableProgramStatus` / `isDeletableProgramStatus` from `src/lib/program-status.ts`, which mirror `api/src/programs/program-status.constants.ts` and accept raw enum keys, humanized labels, or legacy lowercase spellings. Eight sites once hardcoded `DRAFT`/`FOR_REVISION`; when `PUBLISHED_REVISION` was added, seven of them silently disabled controls the server would have accepted. If you add a status to the API constants, update this module in the same change.
- **AIP codes shown in the UI are server-derived — never compute or patch one client-side.** The tentative code is rebuilt server-side from the row's rank among its siblings (see `../AGENTS.md`). Reorder actions in `src/components/aip/_reorder-actions.ts` return the affected rows *with their new codes*; apply those to local state rather than guessing. Reorder payloads must list **every** sibling in the group exactly once — the API rejects partial and cross-scope payloads on purpose.

## Known issues / debt

- **Thin test coverage**: `src/**/*.test.ts` covers a couple of pure `lib/` helpers, and the Playwright suite covers some flows. The add-project/activity form and all AIP workflow endpoints are wired but unexercised against a live cycle.
- **`src/lib/api-client.ts`**: previously held mock implementations; now an empty stub. Do not add mocks here — wire real endpoints via `src/lib/api.ts` + a `_actions.ts` file instead.
- **Real API pattern**: server-side calls go through `src/lib/api.ts` (typed `fetch` wrappers); client components reach them via `'use server'` action files (`_actions.ts`) that read the session token from the httpOnly cookie. See `src/app/programs/new/_actions.ts`, `src/app/programs/[id]/add-project/_actions.ts`, and `src/app/control-panel/*/_actions.ts`.

## When you ship a client feature

- [ ] Components are server components unless they need client interactivity.
- [ ] Forms use react-hook-form with the Zod schema in `lib/schemas.ts`.
- [ ] Monetary fields handled as strings on the wire.
- [ ] Backend terminology used in code (`finishLineId`, `clusterId`, `papSectorId`, not the legacy mock names).
- [ ] No new `any` types without a `// eslint-disable-next-line` and a comment explaining why.
