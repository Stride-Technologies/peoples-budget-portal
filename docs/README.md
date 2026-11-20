# Documentation

| You want to… | Read |
|---|---|
| Try the portal on your machine | [quick-start.md](quick-start.md) |
| Put it on a server | [deployment.md](deployment.md) |
| Name it and switch features on | [configuration.md](configuration.md) |
| Load your offices, goals and AIP | [loading-your-data.md](loading-your-data.md) |
| Use it, as staff or an administrator | [manual/](manual/README.md) |

Project-level documents are at the repository root: [`README.md`](../README.md),
[`PRODUCT.md`](../PRODUCT.md), [`SPEC.md`](../SPEC.md), [`FEATURES.md`](../FEATURES.md),
[`ARCHITECTURE.md`](../ARCHITECTURE.md), [`ARCHITECTURE-ESSENTIALS.md`](../ARCHITECTURE-ESSENTIALS.md),
[`DESIGN.md`](../DESIGN.md), [`SECURITY.md`](../SECURITY.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Reference for developers

| Doc | What it covers |
|---|---|
| [architecture/overview.md](architecture/overview.md) | Components, request lifecycle, global guards |
| [architecture/data-model.md](architecture/data-model.md) | The Prisma data model: diagram, enums, invariants |
| [architecture/workflow.md](architecture/workflow.md) | Year and program lifecycles: the publish model |
| [architecture/frontend.md](architecture/frontend.md) | The Next.js client: routing, server actions, sessions, languages |
| [modules/README.md](modules/README.md) | A page per NestJS module: purpose, endpoints, services, tables |
| [`api/docs/aip-reference.md`](../api/docs/aip-reference.md) | Glossary, lifecycle, permissions, data invariants, AIP code format |
| [`api/docs/api-routes.md`](../api/docs/api-routes.md) | Every HTTP route. **Generated** by `tools/generate-api-routes.mjs`: do not edit |
| [adr/](adr/) | Decisions on the budget-document model |
| [design/](design/) | Design records other docs lean on: tentative AIP codes, import warnings, the complete-AIP export, the local climate typology |

## Reading these docs

The portal was first built for Naga City, and the reference pages still show it: examples use that
city's offices and figures, "finish line" is its word for a top-level goal (the database keeps the
name; the site's label is a setting), and "NCPC" is its people's council (the role works under any
name). Citations like `specs/012` point at that deployment's feature specs, which are not in this
repository. Commands such as `db:import:2027` were its importers for its own files and are
not included either: [loading-your-data.md](loading-your-data.md) says what replaces them.
