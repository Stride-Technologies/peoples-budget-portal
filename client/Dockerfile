# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js client. Build context is the repo root:
#   docker build -f client/Dockerfile -t budget-portal-client .
# Requires output: "standalone" in next.config.ts.

# ---- base: Node + pnpm via corepack -----------------------------------------
FROM node:22.23.4-alpine3.24 AS base
RUN corepack enable
WORKDIR /app

# ---- deps: install the client workspace (incl. dev — needed by next build) --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY client/package.json ./client/
RUN pnpm install --frozen-lockfile --filter client...

# ---- build: produce the standalone server bundle ---------------------------
# NEXT_PUBLIC_* vars are baked in at build time by Next.js. Pass them as
# build args (docker-compose.yml passes them from .env).
FROM deps AS build
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_SITE_ENV
ENV NEXT_PUBLIC_SITE_ENV=$NEXT_PUBLIC_SITE_ENV
# The site's public address, baked into canonical links, the sitemap and share cards.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# What the LGU calls its top-level goals (lib/goal-label.ts), and where its scanned budget PDFs are posted.
ARG NEXT_PUBLIC_GOAL_NAME
ENV NEXT_PUBLIC_GOAL_NAME=$NEXT_PUBLIC_GOAL_NAME
ARG NEXT_PUBLIC_GOALS_NAME
ENV NEXT_PUBLIC_GOALS_NAME=$NEXT_PUBLIC_GOALS_NAME
# Where this deployment's source is published (AGPL §13); components/public/source-link.tsx.
ARG NEXT_PUBLIC_SOURCE_URL
ENV NEXT_PUBLIC_SOURCE_URL=$NEXT_PUBLIC_SOURCE_URL
ARG NEXT_PUBLIC_SOURCE_PDF_PREFIX
ENV NEXT_PUBLIC_SOURCE_PDF_PREFIX=$NEXT_PUBLIC_SOURCE_PDF_PREFIX
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
# The Data Explorer's nav entry and /explore page (specs/018); unset = off.
ARG NEXT_PUBLIC_EXPLORER_ENABLED
ENV NEXT_PUBLIC_EXPLORER_ENABLED=$NEXT_PUBLIC_EXPLORER_ENABLED
# CI runs tsc + eslint before this image is built; skip the redundant checks
# here to avoid OOM on the memory-constrained DO Droplet (2 GB / 4 GB heap).
ENV SKIP_TS_CHECK=1
COPY client ./client
RUN pnpm --filter client build

# ---- runtime: slim image, non-root user -------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# outputFileTracingRoot=repo root means the standalone tree mirrors the repo:
# the server entrypoint is at client/server.js. static/ and public/ are not
# traced automatically and must be copied alongside it.
COPY --from=build /app/client/.next/standalone ./
COPY --from=build /app/client/.next/static ./client/.next/static
COPY --from=build /app/client/public ./client/public

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "client/server.js"]
