# syntax=docker/dockerfile:1
# Multi-stage build for the NestJS API. Build context is the repo root:
#   docker build -f api/Dockerfile -t budget-portal-api .
# The pnpm lockfile and workspace manifest live at the repo root, so they must
# be in the context.

# prisma.config.ts resolves env('DATABASE_URL') eagerly whenever the Prisma CLI
# loads it (including `prisma generate`). `generate` never connects, so a
# throwaway value satisfies it. Declared global (before any FROM) and scoped
# into build layers only — never an ENV, so it cannot leak into the runtime image.
ARG PRISMA_BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build

# ---- base: Node + pnpm via corepack (honors packageManager in package.json) --
FROM node:22.23.4-alpine3.24 AS base
RUN corepack enable
WORKDIR /app

# ---- deps: full install (incl. dev) so the project can be compiled ----------
# python3/make/g++ are needed to compile bcrypt's native addon on Alpine (musl).
FROM base AS deps
ARG PRISMA_BUILD_DATABASE_URL
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY client/package.json ./client/
# Copy the Prisma schema + config before install so the `prisma generate`
# postinstall script in api/package.json can run.
COPY api/prisma ./api/prisma/
COPY api/prisma.config.ts api/tsconfig.seed.json ./api/
RUN DATABASE_URL="$PRISMA_BUILD_DATABASE_URL" \
    pnpm install --frozen-lockfile --filter api...

# ---- build: generate the Prisma client and compile to dist/ -----------------
FROM deps AS build
ARG PRISMA_BUILD_DATABASE_URL
COPY api ./api
RUN DATABASE_URL="$PRISMA_BUILD_DATABASE_URL" pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# ---- prod-deps: production-only node_modules --------------------------------
# --ignore-scripts skips the Prisma postinstall (the client is already built
# into dist/ and shipped from the build stage); bcrypt is then rebuilt
# explicitly so its native addon is present.
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY client/package.json ./client/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter api... \
 && pnpm rebuild bcrypt

# ---- runtime: slim image, non-root user -------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/api

# pnpm keeps the real packages in /app/node_modules/.pnpm with symlinks under
# api/node_modules — copy both so resolution works.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/api/node_modules ./node_modules
# nest build emits to dist/ preserving the src/ tree; entrypoint is
# dist/src/main.js and the Prisma client lands in dist/src/generated/prisma.
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/prisma ./prisma
# The AIP export reads its .xlsx form template from <workdir>/templates at
# runtime (resolved via process.cwd()); ship the committed template with the image.
COPY --from=build /app/api/templates ./templates
COPY --from=build /app/api/package.json ./package.json

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 8000
CMD ["node", "dist/src/main.js"]
