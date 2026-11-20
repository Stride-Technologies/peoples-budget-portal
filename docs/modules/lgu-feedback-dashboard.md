# LGU Public Feedback Dashboard

**Issue:** (issue 43 of the first deployment)
**Branch:** `feat/lgu-feedback-analytics`

## Overview

LGU staff and heads previously had no way to see what the public was saying about their programs. Public feedback submitted via the public registry (`ProgramComment` with `stage = PUBLIC_FEEDBACK`) was only visible in the admin control panel, which LGU users cannot access.

This feature adds a dedicated `/dashboard/feedback` page scoped to the LGU user's own city office, with data visualizations and a paginated feedback list.

---

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Data scope | LGU's own `officeId` programs only | Consistent with how programs are scoped everywhere else; prevents cross-office data leakage |
| Actions | Read-only | Review workflow stays in the admin control panel to avoid conflicts |
| Sentiment analysis | Skipped (future ticket) | Requires LLM API or NLP lib + new DB column; out of scope for v1 |
| Cycle scope | Default active cycle, cycle picker available | Consistent with dashboard; useful for year-over-year comparison |
| Backend | New dedicated `api/src/lgu/` NestJS module | Clean separation from admin logic; RBAC is explicit |
| Charts | Recharts (direct, no shadcn wrapper) | shadcn chart component unavailable for `base-vega` style |

---

## Architecture

### Backend — `api/src/lgu/`

**New files:**

| File | Purpose |
|---|---|
| `lgu.module.ts` | Module declaration; imports `PrismaModule` |
| `lgu.controller.ts` | Route handlers for `/lgu/feedback` and `/lgu/feedback/analytics` |
| `lgu.service.ts` | Business logic; scopes all queries to `user.officeId` from JWT |
| `dto/lgu-feedback-query.dto.ts` | Query DTOs with class-validator decorators |

**Modified files:**
- `api/src/app.module.ts` — registers `LguModule`

#### `GET /lgu/feedback`

Paginated list of `PUBLIC_FEEDBACK` comments for the caller's LGU office programs.

Query params: `cycleId?`, `page?` (default 1), `limit?` (default 25, max 100)

RBAC: Throws `403 ForbiddenException` if `user.officeId` is null (non-LGU users).

Prisma filter:
```ts
{
  stage: CommentStage.PUBLIC_FEEDBACK,
  parentCommentId: null,
  program: {
    officeId: user.officeId,
    deletedAt: null,
    ...(cycleId ? { aipCycleId: cycleId } : {}),
  },
}
```

Response:
```ts
{
  items: [{
    id, content, targetType, targetId, createdAt, resolvedAt,
    program: { id, name, status, aipReferenceCode, tentativeAipReferenceCode }
  }],
  total, page, limit
}
```

#### `GET /lgu/feedback/analytics`

Aggregate stats for the four dashboard widgets. Uses `$queryRaw` (PostgreSQL) for grouped aggregations across a relation boundary.

Query params: `cycleId?`

Response:
```ts
{
  totalCount: number,
  unreviewedCount: number,
  topPrograms: [{ id, name, aipReferenceCode, count }],  // top 10
  byMonth: [{ month: 'YYYY-MM', count }],
  byStatus: [{ status: ProgramStatus, count }],
}
```

---

### Frontend — `client/src/app/dashboard/feedback/`

**New files:**

| File | Type | Purpose |
|---|---|---|
| `page.tsx` | Server component | Fetches analytics + first page of feedback; redirects non-LGU users |
| `cycle-picker.tsx` | Client component | Dropdown to switch AIP cycles via router push |
| `feedback-charts.tsx` | Client component | Stat cards + 3 recharts visualizations |
| `feedback-table.tsx` | Client component | Paginated read-only feedback list with expand/collapse |

**Modified files:**
- `client/src/lib/api.ts` — adds `LguFeedbackRecord`, `LguFeedbackListResponse`, `LguFeedbackAnalytics` interfaces and `apiGetLguFeedback()`, `apiGetLguFeedbackAnalytics()` functions
- `client/src/app/dashboard/page.tsx` — adds "Public Feedback" entry card visible only to `identityType === 'LGU'` users

#### Page layout (`/dashboard/feedback`)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Dashboard          Cycle: [FY 2025 (Active) ▼] │
│ Public Feedback                                          │
│ Citizens' feedback on your office's programs             │
├─────────────────────────────────────────────────────────┤
│ [Total Feedback] [Unreviewed] [Top Program] [Busiest Mo] │
├────────────────────────┬────────────────────────────────┤
│  Feedback Over Time    │  Top Programs by Feedback       │
│  (monthly bar chart)   │  (horizontal bar chart)         │
├────────────────────────┴────────────────────────────────┤
│  Feedback by Program Status (horizontal bar chart)       │
├─────────────────────────────────────────────────────────┤
│  All Feedback (N total)                                  │
│  ┌──────────┬──────┬────────┬─────────────┬──────┬─────┐│
│  │ Program  │ Type │ Status │ Message     │ Date │ Rev ││
│  └──────────┴──────┴────────┴─────────────┴──────┴─────┘│
│                         < Page 1 of N >                  │
└─────────────────────────────────────────────────────────┘
```

#### Access control

- Frontend: `page.tsx` redirects to `/dashboard` if `session.user.identityType !== 'LGU'`
- Backend: `lgu.service.ts` throws `ForbiddenException` if `user.officeId` is null

---

## Dependencies Added

| Package | Where | Version |
|---|---|---|
| `recharts` | `client/` | `^3.8.0` |

---

## Verification Checklist

- [ ] `GET /lgu/feedback` returns correct data scoped to the LGU user's city office
- [ ] `GET /lgu/feedback/analytics` returns all four aggregate shapes correctly
- [ ] Request with no `officeId` (e.g. SUPER_ADMIN) returns `403`
- [ ] `/dashboard` shows the "Public Feedback" card only for LGU users
- [ ] `/dashboard/feedback` loads stat cards and charts with real data
- [ ] Cycle picker switches cycle and re-fetches all widgets
- [ ] Table paginates correctly; message preview expands/collapses
- [ ] Non-LGU users hitting `/dashboard/feedback` are redirected to `/dashboard`
- [ ] `pnpm --filter client tsc --noEmit` passes with no new errors
