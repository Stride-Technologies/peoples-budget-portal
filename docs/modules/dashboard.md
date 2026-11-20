# `dashboard`

The city-wide AIP progress tracker behind `/dashboard`. One read-only aggregate
endpoint; no writes, no DTOs, no tables of its own.

## Why it is its own module

The dashboard used to be built client-side from `GET /programs?pageSize=100`.
That was wrong three ways, and each one is a rule this module now encodes:

| Old behaviour | Problem | Now |
|---|---|---|
| Summed `grandTotal` | `grandTotal` is structurally 0 while line-item entry is deferred, so every peso figure rendered as ₱0 | Sums `proposedTotal`, matching the public registry (`public.service.ts` → `_sum.proposedTotal`) |
| Fetched `pageSize: 100` and tallied in the browser | Program 101 onward silently missing from the counts | Aggregates the whole cycle server-side |
| Read `/programs`, which applies `buildVisibilityWhere` | STAFF/HEAD saw only their own office and cluster, so each role got a different denominator | Deliberately unscoped |

## Endpoint

```
GET /dashboard/summary?cycleId=<uuid>
```

Authenticated via the global `JwtGuard`. **No `@Roles`, no
`@RequirePermission`** — an unannotated route passes `PermissionGuard` by
design. `cycleId` is optional; omitted, the service resolves the active cycle
`OPEN → PLANNING → newest`.

### The unscoped rule

Neither the controller nor the service accepts a user parameter. Caller identity
cannot reach the query — that is the guarantee, not a convention.

This is the one place in the API where that is correct. The tracker exists so an
office can compare its progress against the rest of the city; scoping it would
hand each role a different denominator and make every percentage
non-comparable. **Do not add `@Roles`, `@RequirePermission`, `@CurrentUser`, or
`ProgramsService.buildVisibilityWhere` to this module.**

### Published vs draft

Published means `publishedVersionId != null`, never a status list. This mirrors
`PUBLICLY_VISIBLE` in `public.service.ts`: `PUBLISHED` and `PUBLISHED_REVISION`
are both live to the public and both serve the same snapshot, so keying on the
snapshot pointer means the dashboard cannot drift from the public registry.
Everything else — including the legacy `SUBMITTED`/`APPROVED` rows — is a draft.

### Response

```ts
{
  cycleId, fiscalYear, cycleStatus,
  totals: { programs, drafts, published, unassignedPrograms },
  budget: {
    published: { total, ps, mooe, co },   // decimal strings
    draft:     { total, ps, mooe, co },
  },
  byFundSource: [{ key, total }],          // key: a FundSource, or MULTIPLE / NONE
  byFinishLine: [{ finishLineId, name, color, visionNumber,
                   published: { count, total }, draft: { count, total } }],
  byCluster: [{ clusterId, name, officeCount, officesWithPublished,
                offices: [{ officeId, acronym, name, total, drafts, published }] }],
  officesWithNoSubmissions: [{ id, acronym, name, clusterName }],
  publishedByWeek: [{ weekStart, count }],
}
```

Published and draft are shipped **separately at every level** so the client's
All / Published / Drafts filter is a pure re-sum of data already on the page —
no refetch, no second endpoint.

## Invariants

1. **Cluster percentage denominators come from the active office list, not from
   programs.** `officeCount` counts every active office in the cluster, so an
   office that has submitted nothing counts against its cluster instead of
   vanishing. Deriving it from programs would make a cluster where one office of
   twenty has published read as 100%.
2. **`Program.officeId` is nullable** (legacy SUPER_ADMIN rows). Those count in
   `totals` and in `unassignedPrograms`, and appear in no office or cluster row —
   so the office table summing to less than the headline is expected and
   accounted for, not a discrepancy.
3. **`publishedByWeek` is gap-filled** from the first publication to today.
   Without explicit zeroes the area chart draws a straight line across a quiet
   fortnight, which reads as steady progress rather than as nothing happening.
4. **The expense-class family is not a partition of `proposedTotal`.**
   `psProposedTotal` / `mooeProposedTotal` / `coProposedTotal` are separate
   rollups, and in practice most programs fill `proposedTotal` and not these
   (97% of the published FY2027 budget). The client renders the remainder as an
   explicit **Not yet classified** bar rather than showing bars that don't add
   up to the headline.
5. **`byFundSource` counts each funding entry exactly once: leaf PPAs, plus
   every program with no PPAs.** A program that states its own costs
   (`DIRECT_COSTS`) holds no PPAs, so it is its own entry — its `fundSources`
   or `fundAllocations` against `proposedTotal`, the same rule as the public
   Overview. Reading PPAs alone dropped most of 2027 (₱5.95B of ₱9.01B on the
   seeded cycle). `fundSources` is `fundSources` is
   multi-valued and amount-less by design — the budget office names the funds a
   PPA draws on, it never splits the estimate across them — so a PPA listing two
   or more funds goes into a single **`MULTIPLE`** bucket. Attributing its full
   amount to each fund would push the bars past the real budget; dividing it
   would invent a split the city never made. PPAs with no fund at all are
   **`NONE`**, *not* defaulted to GF the way the Excel export does, because the
   dashboard's job is to show the gap. Rows are leaves (`children: { none: {} }`)
   because an `ACTIVITY_CHILDREN` parent restates its children's money and unions
   their funds. A PPA **split by fund** (`fundAllocations`) is the exception:
   each line goes to its own fund. The result: `byFundSource` sums to the same
   grand total as `budget` (published + draft) to the centavo — checked against
   the seeded FY2027 cycle, and asserted in `dashboard.service.spec.ts`.

## Services

`DashboardService.summary()` runs three queries — all live programs in the cycle,
all active offices with their cluster, and all leaf PPAs in the cycle — then
delegates to the exported pure functions `aggregateDashboard(cycle, rows,
offices, now, paRows)`, `fundingEntries(rows, paRows)` and
`aggregateFundSources(entries)`. Being pure is what
makes them testable without a Prisma mock; `dashboard.service.spec.ts` covers the
draft/published split, the ₱0 regression, the zero-submission denominator, the
office-less program, ISO-week bucketing, and the multi-fund bucketing.

The whole-cycle scan is a deliberate shortcut (marked `ponytail:` in the
source): a city AIP cycle is hundreds of rows, and Prisma has no conditional
aggregates, so a `groupBy` would need four round trips to produce the same
split. Past roughly 10k programs in one cycle, move it to `$queryRaw` with
`SUM(...) FILTER (WHERE published_version_id IS NOT NULL)`.

## Client

| File | Role |
|---|---|
| `client/src/app/dashboard/page.tsx` | Server component; one `apiGetDashboardSummary` call, city-wide section rendered identically for every role |
| `client/src/app/dashboard/dashboard-charts.tsx` | Recharts pie (with the client-side All/Published/Drafts filter), published-per-week area, budget-mix bars, fund-source bars |
| `client/src/app/dashboard/submission-progress.tsx` | Cluster / Office tabs, reusing `components/aip/drawer-tabs.tsx` |

Zero-submission offices are collapsed behind a disclosure in the office table:
the count stays visible in the card header, the names are one click away. There
are 54 of them against 8 active offices on FY2027, so listing them inline buries
the offices that have actually moved.

Chart entry animations are disabled (`isAnimationActive={false}`) — a dashboard
should not withhold its figures for 1.5 seconds, and static charts keep the
Playwright screenshots deterministic.
