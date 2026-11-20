# Module: `health`

**Folder:** `api/src/health/`

## Purpose

Exposes a liveness/readiness probe so orchestrators (Azure Container Apps) and
load balancers can tell whether the API is up.

## Endpoint

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | Health check |

The route is `@Public()` — probes carry no credentials.

## What it checks

The check is built on NestJS **Terminus**. It reports the API process as up and
verifies its critical downstream dependencies (database, and Redis where
applicable). A failing dependency surfaces as a non-200 response so the
orchestrator can recycle the container.

## Dependencies

`TerminusModule`, `PrismaService` (and Redis indicators where configured).

## Related

- [deployment.md](../deployment.md) — how Container Apps use the probe
- [architecture/overview.md](../architecture/overview.md)
