# AIP Backend — Project Reference

This is the domain reference for the Annual Investment Program (AIP) backend of the People's Budget Portal. Use it to orient yourself before reading code or to settle disputes about terminology, invariants, and conventions. For per-module developer reference (purpose, endpoints, services, diagrams), see [`../../docs/modules/`](../../docs/modules/README.md); for architecture and workflow diagrams, see [`../../docs/architecture/`](../../docs/architecture/overview.md).

---

## 1. Product Frame

The People's Budget Portal supports the city's AIP cycle, with a **budget reform** that departs from the standard DBM Budget Operations Manual (BOM) practice in three important ways:

1. **Bottom-up budget rollup.** A Program's total is computed by summing its child Project/Activity line items, not declared top-down.
2. **Finish-line-anchored ceilings.** Each fiscal year, every strategic FinishLine carries a single budget ceiling (`totalCeiling`) that all of its programs draw against. (The legacy LGU/CSO ceiling partition was retired with the NCPC proponent track — endorser pivot Phase 3.)
3. **Single LGU proposal track + an advisory endorser body.** Every program is an LGU office submission. NCPC is no longer a proponent track — it is an **endorser body** (umbrella head + CSO representatives) that provides advisory, non-gating concurrence. See endorser pivot.

The portal also tracks the standard DBM artifacts (PAP Sector classification, UACS object codes, CCET climate tagging, SGLG indicators) so that submissions remain compliant with national reporting requirements.

Future scope (architected for, not built yet): Sangguniang Panlungsod submissions, budget execution monitoring, procurement integration.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **AIP** | Annual Investment Program — the city's prioritized list of programs/projects/activities for a fiscal year. |
| **BudgetCycle** | One fiscal year's whole budget (CONTEXT.md "Budget Cycle"); the AIP is one stage of it. Holds the staff-set stage (0–9) and wraps the year's `AIPCycle` 1:1 (specs/012, ADR 0002). |
| **AIPCycle** | The AIP stage of a Budget Cycle. Has its own lifecycle: `PLANNING → OPEN → CLOSED → ADOPTED` (`LOCKED` is the pre-012 name for `ADOPTED`, read alike until the P8 contract migration). Adopting the AIP does **not** make the year an Annual Budget — an enacted Ordinance does. |
| **PPA** | Program / Project / Activity — DBM's collective term for fundable items. |
| **Program** | The container. Has one FinishLine tag, an optional SGLG tag, optional SDG tags, a PAP Sector, and an LGU city-office proponent. Owns multiple Project/Activity children. |
| **ProjectActivity (PA)** | A child of a Program. Has `type: PROJECT | ACTIVITY`. Holds line items and (optionally) one ClimateChangeTag. A Program may also carry one tag of its own. |
| **LineItem** | The unit of budget. Has `expenseClass` (PS/MOOE/FE/CO), a UACS object, quantity, unit, unit cost. |
| **Expense class** | `PS` Personal Services, `MOOE` Maintenance and Other Operating Expenses, `FE` Financial Expenses (bank charges, interest, other financial charges — the 2023 Budget Operations Manual's fourth class, added by specs/008), `CO` Capital Outlay. Always listed in that order. Every per-class figure has an FE twin (`feTotal`/`feProposedTotal` on Program, `feEstimate`/`feTotal` on ProjectActivity, `fe` on FundAllocation), default 0; the locked 2026 cycle keeps its one financial charge in MOOE, as printed. |
| **Form 7 column / special fund** | `Office.form7Column` (`GENERAL_PUBLIC`, `SOCIAL`, `ECONOMIC`, `ECONOMIC_ENTERPRISE`, or null) is the LBP Form 7 column an office's money prints in; it is not an AIP code segment. Special funds (SPA, LDF, LDRRMF) are fund sources, not offices (specs/016): on the General Fund's form they print as lump sums built from every row carrying the fund, and each may carry one stated amount per cycle (`FundStatedAmount`, invariant 22). |
| **Proponent** | Who proposed the Program — always an LGU `Office` (`officeId` set). The NCPC proponent track was retired; the `proponentType` / `civilSocietyOrganizationId` columns and the `ProponentType` enum have been dropped. |
| **FinishLine** | A strategic outcome ("FL1 – Thriving & Inclusive Economy", "FL4 – Healthy & Educated Nagueños with Decent Homes", etc.). the LGU's strategic framework defines 8 of them. |
| **SubFinishLine** | A sub-category within a FinishLine (e.g., "Trade & Investment" under FL1). Programs may optionally reference one `SubFinishLine` in addition to their `FinishLine`. Managed via the reference API and control panel. Soft-deleted via `isActive`. |
| **Cluster** *(formerly Sector)* | A strategic grouping linked to FinishLines and to organizations. Both `Office` and `CivilSocietyOrganization` carry `clusterId`. Used for sector-scoped peer feedback. Renamed from `Sector` in the schema. |
| **PAPSector** | DBM's 4-digit classification of public expenditure (e.g., 1000 = General Public Services, 3000 = Social Services, 8000 = Economic Services). Sourced from BOM Annex 2. **Distinct from `Cluster`.** Used as the first segment of the AIP reference code. |
| **Office** | An office of the LGU — the single office catalog. Carries `officeCode` and `officeType` ∈ `{MANDATORY, OPTIONAL, OTHERS}` directly (AIP code segments 4 and 3) plus `lguLevel` (segment 2, always 2 = City). Also carries the printed sheet's header block — `mandateLegalBasis`, `vision`, `mission`, `organizationalOutcomes` — all optional, maintained in the control panel under `reference:write`, and none of them code segments. These lived in a separate `DBMOffice` table until the city reissued its AIP coding system as one flat list; see §7. Also carries a nullable `papSectorId` — the office's usual PAP sector, used only to pre-select a form field and **not** a code segment. |
| **PAP Class** | The AIP form's three appropriation sections: `GAS` (General Administration and Support), `STO` (Support to Operations), `OPERATIONS`. Set per Program and inherited by its whole PA subtree. It groups and orders rows in the exports **and is AIP code segment 5** (GAS=`001`, STO=`002`, OPERATIONS=`003`), with the program ordinal restarting inside each section. The column stays nullable and everything reads `papClass ?? OPERATIONS`, including the emitted segment — migration `20260804000001` backfilled every pre-existing program, and the create DTO requires a value. The city's `004` component bucket is never generated; see §7. |
| **Fund Source** | Where a PPA's money comes from — `GF`, `SEF`, `LDF`, `LDRRMF`, `SPA`, `PPP`, `NGA`, `DONATIONS_GRANTS`, `GAD`, `TRUST_FUND`, `SHF` (**Special Health Fund**), `EDF`, `CCN`, `JOINT_VENTURE`, `BORROWINGS`. Multi-valued per `ProjectActivity` and, by default, **amount-less**: the funds of one total. A row may instead be **split by fund** (`FundAllocation`, invariant 21) — one PS/MOOE/FE/CO line per fund — when the city writes it that way (NCGH: GF + SHF + GAA). Stored as an enum array, printed in column G of the Basic AIP sheet. The export still falls back to `GF` on an empty array, but no row relies on that any more — migration `20260804000001` backfilled every pre-existing PPA to `{GF}`, and the create DTO requires at least one value. |
| **SGLG** | Seal of Good Local Governance — DILG's annual recognition program. Programs can tag a single optional `SGLGIndicator`. |
| **SDG** | UN 2030 Agenda Sustainable Development Goals. Programs can tag **any number** of `SDGGoal`s (many-to-many via `ProgramSDGGoal`), unlike the single-valued SGLG tag. Codes are zero-padded `SDG-01 … SDG-17` so plain `code asc` sorts numerically. Printed in column C of the Extended AIP sheet ("SDG / CDP Goal Being Addressed"). |
| **UACS** | Unified Accounts Code Structure — DBM's standard chart of accounts. Each LineItem references a UACS object code. |
| **CCET** | Climate Change Expenditure Tagging — DBM-CCC joint memo defines typology codes (CCA = Adaptation, CCM = Mitigation, plus crosscutting). Optional per PA or Program; 0..n codes per tag, from the **local** typology. |
| **NCPC** | The people's council (named for the Naga City People's Council, the first deployment's) — the umbrella for civil-society organizations. NCPC is an **endorser body** (no longer a proponent track): its umbrella head and the representatives of `canEndorse` CSOs provide advisory endorsements. NCPC users have identity type `NCPC`. |
| **MFO** | Major Final Output — the short service label the printed AB sheet repeats down a run of rows ("Administrative and Support Services"). Stored in `majorFinalOutput` on both Program and ProjectActivity. |
| **Performance Indicator** | The measurable sentence the printed sheet puts beside the MFO ("Percentage of PPAs implemented within budget and schedule"). Stored in `expectedOutput` — the column predates the template's three-column split and was relabelled rather than migrated. **Optional** on both Program and ProjectActivity; offices routinely draft before it is settled. |
| **Target for the Budget Year** | The printed sheet's target column. Stored in `targetForBudgetYear`, free text — the city writes "100%", "27 BASCA" and "1 (walk) / 3 (lectures)" in the same column. |
| **AB 2026** | The city's enacted FY2026 Annual Budget (Ord. 2025-131). **Since specs/012 it is an ORDINANCE Budget Document** (`db:seed:document -- --year 2026`, then `--enact`, `--retire-programs`; each PPA cites the city's `.doc` by table and row, each object line the `.xls` by sheet and row); originally seeded as a historical record: every program `APPROVED` with the city's own printed `aipReferenceCode` copied verbatim, the cycle `LOCKED`, and nothing published until someone presses publish. Imported by `db:import:2026` → `db:seed:2026`; see `docs/design/ab-2026-import.md`. |
| **Component program** | A program budgeted under another office's printed AB sheet, in that sheet's COMPONENT PROGRAMS band — City Health Office II under CHO, OSCA and ECCDD under CSWDO. Modelled as `Program.hostOfficeId`; the program keeps its own `officeId`, and its code names its own office exactly as the city's book does. `hostOfficeId` **may equal `officeId`** — that is the city's `004` bucket, where an office lists a program in its own sheet's component band instead of under GAS/STO/Operations (CSWDO does it for Paskohan sa Barangay). It prints in the band rather than a section, so nothing appears twice. |
| **Verdict** | The `ProgramVerdict(verdict=APPROVE)` record written by `finalizeApproval` at final approval — the durable record of who finalized a program and when. Today it is produced **only** by the LFC committee path (the SUPER_ADMIN verdict override was removed — see endorser pivot OD-3). The `VerdictType` enum is now `APPROVE`-only — the unused `INCREASE`/`DECREASE`/`REJECT` values were pruned in Phase 4. |
| **ProgramVersion** | An immutable JSON snapshot of a Program's full tree (program + PAs + line items + tag) taken on every `DRAFT | FOR_REVISION → SUBMITTED` transition. Drives side-by-side review. |
| **Endorsement** | An **advisory, non-gating** concurrence by an endorser. Recorded **ad-hoc** (a `ProgramEndorsement` row is created only when an endorser opts in) and **affirmative-only** (a row means "concurred" — there is no pending/reject state). It never changes the program's status and is never required to advance. Concerns are raised as `ENDORSEMENT`-stage comments. Endorsers are **polymorphic** (`endorserType`): a `canEndorse` city office's HEAD (`LGU`), the **NCPC umbrella head** (`NCPC`, an `NCPCUser` with no CSO), or a **CSO representative** — the HEAD of a `canEndorse` `CivilSocietyOrganization` (`NCPC`, tagged with `endorserCsoId`). See endorser pivot §3.3. |
| **LFC (Local Finance Committee)** | The AIP's standing approving body — a `Committee` whose `code = 'LFC'`. Member offices today are CPDO, CBO, CTO, CMO. Membership is stored in `CommitteeMembership` (many-to-many with `Office`); adding more committees later is data, not schema. |
| **Committee approval** | The sole approval gate, entered directly from `HEAD_REVIEWED`. `ProgramApproval` rows are one per `(programVersion, committee, member office)`; status flows `PENDING → APPROVED | RETURNED | REJECTED`. A program reaches `APPROVED` only when **all** rows for the current version are `APPROVED`; a `RETURNED` row sends it to `FOR_REVISION` (recoverable) and a `REJECTED` row sends it to `REJECTED` (terminal). |
| **FOR_REVISION** | A `ProgramStatus` for a program that was submitted and then returned for changes by an LFC committee return. Editable and resubmittable just like `DRAFT`; the two are kept distinct so the UI can name the state clearly. |
| **Comment thread** | A root `ProgramComment` plus its one level of replies. The root carries `resolvedAt` / `resolvedByUserId`. Unresolved threads block resubmission (§6 invariant 11). |
| **ProgramReadState** | Per-user, per-program `lastSeenAt` marker. Drives the registry's "unread" dot; bumped by `POST /programs/:id/mark-seen`. |
| **Activity nudge (SSE)** | A thin `{ type, programId, actorUserId, ts }` event pushed over `GET /events` when a comment/status change occurs. Clients refetch on receipt; relevance = program visibility. Auth via a single-use ticket from `POST /events/ticket`. |

### Terminology pitfalls to avoid

- **"Sector" is ambiguous.** The codebase had a model called `Sector` that represents strategic groupings. That model is renamed to `Cluster`. When DBM/BOM uses "sector" it means **PAPSector** (the 4-digit classification). The frontend's current `MOCK_SECTORS` reflects PAPSector data; its `MOCK_CLUSTERS` reflects FinishLine data despite the name. Frontend reconciliation is a separate task — until then, mentally map: frontend `MOCK_CLUSTERS` ↦ FinishLines, frontend `MOCK_SECTORS` ↦ PAPSectors, backend `Cluster` (new name) ↦ strategic groupings.
- **There is one office table.** `Office` (`offices`) is the whole catalog. The DBM/city split — `DBMOffice` classifying `CityOffice` — was collapsed when the city reissued its coding system; `officeCode` and `officeType` are now columns on `Office`.
- **"Program" is loaded.** The BOM hierarchy is Program → Project → Activity. The portal collapses this to Program → (Project | Activity) flat. A future migration may introduce Project → Activity nesting using the existing `parentProjectActivityId` column.

---

## 3. Proponent Track (LGU-only)

Every program is an **LGU city-office** submission. The NCPC proponent track was
retired (endorser pivot Phase 3): NCPC is now an [endorser body](#4-lifecycle-state-machine),
not a proposer.

| | LGU track |
|---|---|
| Proponent | the implementing `Office` (`officeId`); no `proponentType` column |
| Owner organization | `Office` (`officeId` set; `civilSocietyOrganizationId` always null) |
| Proposer identity type | `IdentityType.LGU` |
| AIP reference code | `{papSector}-{subsector}-{lguLevel}-{officeType}-{office}-{program}-{pa}` (no prefix) |
| Ceiling pool | the finish line's single `totalCeiling` for the cycle |

Program **create is LGU-only**: `ProgramsService.create` rejects any non-LGU
`proponentType` and requires a `officeId`. Existing NCPC-proponent programs
were hard-deleted in migration `20260611120000` (OD-1). Peer visibility is granted
by shared `Cluster` (any office in cluster X can read/comment-feedback on any
program in cluster X).

---

## 4. Lifecycle State Machine

> **Phase 1 (current):** the lifecycle is `DRAFT → PUBLISHED`, with
> `PUBLISHED_REVISION` for a published AIP carrying an unpublished draft. The
> gate chain documented below — SUBMITTED → HEAD_REVIEWED → PENDING_APPROVAL →
> APPROVED plus the LFC batch — is **preserved on `archive/full-approval-workflow`**
> and restored in Phase 2. See
> `docs/design/phase-1-publish-scope.md`.
>
> ```
> DRAFT ──publish──► PUBLISHED ──revise──► PUBLISHED_REVISION
>                        ▲                        │
>                        └──republish / discard───┘
> ```
>
> - Editability is derived from status. `PUBLISHED` is **not** editable, which
>   gives the invariant *live rows == publishedVersionId's snapshot*; opening a
>   revision is an explicit, permissioned, logged act.
> - Deletion and submit use narrower sets (`DELETABLE_PROGRAM_STATUSES`,
>   `SUBMITTABLE_PROGRAM_STATUSES`) so a published AIP can never be deleted
>   mid-revision, nor pushed back into the approval chain by a Phase 2 merge.
> - Public visibility keys on `publishedVersionId`, never on status.
> - Publish preconditions: ≥1 PA, and every PA with `proposedBudget > 0`.
>   Unresolved comments never block; ceilings are advisory only.


### AIPCycle (annual container)

```
PLANNING ──set ceilings──► OPEN ──no new submits──► CLOSED ──nothing unfinished──► ADOPTED
                            (programs created, edited, published)              (LOCKED = old name)
```

- SUPER_ADMIN owns all transitions.
- Finish-line budget ceilings can be created or updated while the cycle is
  `PLANNING` or `OPEN`. Updates are audited in
  `FinishLineBudgetCeilingHistory` and apply immediately to later approval
  checks.
- `OPEN → CLOSED`: blocks new Program creation and `DRAFT → SUBMITTED`. Existing submissions can still be reviewed and approved.
- `CLOSED → ADOPTED`: refused while any live program is not `PUBLISHED` (or, from the archived approval workflow, `APPROVED` / `REJECTED`) — drafts and unpublished revisions block it. Published programs could never lock before (#81). Ceilings are frozen once adopted.
- **Which public section a year is in** is computed by the API, never from this status alone: `computeSections` in `api/src/budget-cycles/cycle-sections.ts` (specs/012).

### Program (per submission)

```
   DRAFT (brand-new) ─submit─┐                          ┌─ FOR_REVISION ◄────┐
                             ▼                          │                     │
   FOR_REVISION ──resubmit──► SUBMITTED ──head review──► HEAD_REVIEWED        │
                                                              │               │
                                                  batch submit │               │
                                                              ▼               │
                                                    PENDING_APPROVAL           │
                                       LFC offices decide per office-batch (sequenceOrder):
                                         batch advances only when ALL programs clear
                                         the office; last office ─► APPROVED (all)
                                         any RETURN   ─► FOR_REVISION ─────────┘

   (advisory, parallel) endorse: a canEndorse office HEAD may record an
   affirmative ProgramEndorsement at any point SUBMITTED…PENDING_APPROVAL.
   It never changes status and never gates submission for approval.
```

- `DRAFT | FOR_REVISION → SUBMITTED`: requires ≥1 PA with ≥1 LineItem, **and every comment thread on the program resolved** (the feedback gate — see §6 invariant 11). Writes a new `ProgramVersion` snapshot (monotonic `version`).
- `SUBMITTED → HEAD_REVIEWED`: pure status flip by the HEAD of the proponent's own org. No side effects.
- `HEAD_REVIEWED → PENDING_APPROVAL`: batch action — `POST /aip-cycles/:id/submit-for-approval` by the HEAD (`batchSubmitForApproval`). Programs enter a persisted `ProgramApprovalBatch` (one open batch per office + cycle). The **first** submission is all-or-nothing (blocked if any editable program in the caller's office is not `HEAD_REVIEWED`) and opens the batch at the first LFC office; **later** submissions — a resubmitted return or a new program added while the batch is paused — join the active batch at its `currentSequenceOrder` and inherit ordinary `APPROVED` rows (system note) for every earlier office. **Endorsement is not a precondition.** Creates a `ProgramApproval(status=PENDING)` at the current LFC office (stale `PENDING` rows from superseded versions are purged first). Fast path: if the `Committee` with `code = 'LFC'` has no members, the program is finalized straight to `APPROVED`.
- **Endorsement (advisory, off the state machine)**: `POST /programs/:id/endorse` by any endorser — a `canEndorse` office HEAD (`endorserType=LGU`), the NCPC umbrella head, or a `canEndorse` CSO's representative HEAD (both `endorserType=NCPC`) — upserts one affirmative `ProgramEndorsement` for the caller's own endorser identity on the current version. The endorser identity is derived from the caller by `resolveEndorserIdentity`. Idempotent per endorser; never changes the program's status; allowed while `SUBMITTED…PENDING_APPROVAL`. There is no reject/pending — concerns are `ENDORSEMENT`-stage comments.
- **Committee path** `PENDING_APPROVAL → APPROVED`: LFC review is **sequential by office and gated per proponent-office batch**. The active office's HEAD calls `decideLfcApproval` (single-program drawer) or `POST /lfc/offices/:officeId/approve-all` (batch). On `APPROVED`, the office's row is written and the **batch gate** is evaluated: the batch advances to the next office (or finalizes, at the last office) **only when every in-scope program in the batch has cleared the current office** — an approved program otherwise stays `PENDING_APPROVAL` and waits for its siblings (`advanceBatchIfReady`). Finalization runs `finalizeApproval` for **all** in-scope programs together — hard ceiling check, final `Program.aipReferenceCode` and PA codes, `ProgramVerdict(verdict=APPROVE)`, status `APPROVED` — and closes the batch (`closedAt`).
- **Committee path — return** the active LFC office may `RETURNED` (**recoverable**) → Program drops to `FOR_REVISION` and the batch pauses at the returning office (a returned sibling keeps its current version in the batch and blocks advancement until resubmitted and re-approved). The notes spawn an `APPROVAL`-stage `ProgramComment` the proponent must resolve, then revise and resubmit. Uninvolved LFC HEADs may add more `APPROVAL` comments while in `FOR_REVISION`; those join the feedback gate. Driven by `POST /lfc/offices/:officeId/return-all` (or `decideLfcApproval`).
- **Terminal rejection is deprecated.** Normal LFC flow is approve or return-for-revision. `REJECTED` decisions and `POST /lfc/offices/:officeId/reject-all` now return `400`; use a recoverable return instead.
- **No SUPER_ADMIN verdict override.** The verdict path (`issueVerdict`) was removed (endorser pivot OD-3): the LFC committee is the sole authority over a program's fate. SUPER_ADMIN configures cycles/ceilings/committees and observes, but cannot approve, reject, adjust, or cast an LFC office's decision.

### Children inherit

`ProjectActivity` has **no status column**. It inherits the parent Program's status at query time. Side effects:
- New PAs and LineItems can only be added or edited while the parent Program is `DRAFT` or `FOR_REVISION` — see `programs/program-status.constants.ts`.
- Once the Program leaves those states, every PA and LineItem is locked until the Program returns to `FOR_REVISION`.

---

## 5. RBAC Matrix

> **Phase 1:** capability comes from **named permission keys**, not the role
> enum. `Role` contributes nothing at runtime beyond the `SUPER_ADMIN` bypass —
> a `UserPermission` row is a grant and absence is denial. Office scope is a
> second, orthogonal dimension: *can I do this verb?* (`@RequirePermission()`,
> checked by `PermissionGuard`) and *on whose records?*
> (`OfficeScopeService`, checked in the service layer where the resource's
> `officeId` is known). **Both must pass.**
>
> The catalog is `api/src/permissions/permission-catalog.ts` — the source of
> truth, mirrored into the `permissions` table at boot with a drift warning in
> both directions. Per-route keys are in the Permission column of
> [`api-routes.md`](api-routes.md).
>
> Office scope resolves as: `SUPER_ADMIN` → ALL; `allOfficesScope` → ALL;
> otherwise `UserOfficeScope[] ∪ LGUUser.officeId`. The union with the home
> office is why no existing user needed a backfill.
>
> The role matrix below still describes the **archived** approval workflow.
>
| Capability | STAFF | HEAD | SUPER_ADMIN |
|---|:---:|:---:|:---:|
| Create/edit Program (`DRAFT` / `FOR_REVISION`) within own org | ✓ | ✓ | ✓ |
| Delete Program (DRAFT only; cascade to projects/activities) within own org | ✓ | ✓ | ✓ (may override non-DRAFT) |
| Submit Program (`DRAFT | FOR_REVISION → SUBMITTED`) | ✓ (own) | ✓ (own) | ✓ |
| Mark Program `HEAD_REVIEWED` | ✗ | ✓ (HEAD of proponent org) | ✓ |
| Batch submit for LFC approval (`HEAD_REVIEWED → PENDING_APPROVAL`) | ✗ | ✓ (HEAD of proponent org) | ✗ |
| Endorse a program (advisory, affirmative, `POST /programs/:id/endorse`) | ✗ | ✓ (HEAD of a `canEndorse` office, the NCPC umbrella head, or a `canEndorse` CSO's rep HEAD) | ✗ |
| Decide LFC committee approval (single-program) | ✗ | ✓ (HEAD of an LFC member office) | ✗ |
| Batch approve-all / return-all / reject-all (`/lfc/offices/:officeId/…`) | ✗ | ✓ (HEAD whose `officeId` = `:officeId`) | ✗ |
| Read the LFC board / program registry | ✓ (scoped) | ✓ (scoped) | ✓ (all) |
| Read Programs in own cluster | ✓ | ✓ | ✓ |
| Read Programs across all clusters | ✗ (✓ if `identityType=LFC`) | ✗ (✓ if `identityType=LFC`, a `canEndorse` office, or an NCPC endorser) | ✓ |
| Post a comment (stored as `GENERAL`) | `comments:write` + can read the program | `comments:write` + can read the program | ✓ |
| Resolve / reopen a comment thread | ✓ (own program or own comment) | ✓ (own program or own comment) | ✓ |
| Edit `FinishLineBudgetCeiling` | ✗ | ✗ | ✓ |
| Edit `AIPCycle` lifecycle | ✗ | ✗ | ✓ |
| Edit reference data (PAPSector, UACS, SGLG, SDGGoal, ClimateTypologyCode, Office) | ✗ | ✗ | ✓ |
| Hard-delete an APPROVED Program | ✗ | ✗ | ✓ (admin override; audit logged) |

Sector-scoped peer feedback uses `Cluster`, not the program's `FinishLine`. The reader's `cluster` (resolved via `LGUUser.office.clusterId` or `NCPCUser.civilSocietyOrganization.clusterId`) must match the program's owning org's `clusterId`.

**Program delete cascade:** When a Program is soft-deleted (`deletedAt` set), all child ProjectActivities are also soft-deleted in the same transaction. Note: ProgramVersions, ProgramVerdicts, ProgramEndorsements, and ProgramApprovals are only created on `DRAFT → SUBMITTED` transition, so a DRAFT program should never have these records. If a non-DRAFT program is deleted (SUPER_ADMIN override only), such orphaned records will remain in the database but isolated from the public API.

**Program edit DRAFT-only:** Editing a Program requires `status = DRAFT`. Both the PATCH (update) and DELETE endpoints enforce this; SUPER_ADMIN may delete non-DRAFT programs. Returns `403 Forbidden` if the constraint is violated.

Endorsement authorization, expanded (`resolveEndorserIdentity`): a HEAD records a `ProgramEndorsement` according to which org they belong to, and only while the program is endorsable (`SUBMITTED…PENDING_APPROVAL`):
- **LGU** — `user.officeId = X AND Office(X).canEndorse` ⇒ `endorserType=LGU`, `endorserOfficeId=X`.
- **CSO representative** — `user.civilSocietyOrganizationId = C AND CivilSocietyOrganization(C).canEndorse` ⇒ `endorserType=NCPC`, `endorserCsoId=C`.
- **NCPC umbrella head** — `identityType = NCPC` with no city office and no CSO ⇒ `endorserType=NCPC`, `endorserCsoId=null` (always allowed; provisioned by SUPER_ADMIN through the invite flow).

The identity is derived from the caller (not a route param); the action is affirmative-only and idempotent **per endorser**. STAFF never endorse. SUPER_ADMIN does **not** endorse on anyone's behalf.

LFC approval gate, expanded: a user can act on `ProgramApproval(officeId=X)` if and only if `user.role = HEAD AND user.LGUUser.officeId = X AND a CommitteeMembership exists linking X to the Committee with code 'LFC'`.

Developer visibility: `identityType = DEVELOPER` has no office and no CSO, so it reads exactly what its office scope grants (an all-offices grant reads the city) and nothing otherwise. Any user with no scope, cluster or endorser role matches **no** programs (`buildVisibilityWhere` returns `id: { in: [] }`; it used to drop the filter and list every program, then 403 on each).

LFC visibility: users with `identityType = LFC` (staff or head) read all programs — they are committee analysts and decision-makers; the LGU/NCPC cluster-peer scoping does not apply to them.

Comment stage is no longer derived: every staff comment is `GENERAL`, public feedback is `PUBLIC_FEEDBACK`, and `CreateCommentDto` has no `stage`. Who may comment is `comments:write` plus **read access to the program**, regardless of role or program status (`CommentsService.assertCanWrite`). Commenting is review, not editing, so it follows read access rather than the office scope that gates writes (#102): an NCPC CSO representative comments on their cluster's programs, a Developer on whatever its office scope grants. A side effect: an LGU user with `comments:write` can now also comment on same-cluster peers' programs, which they could already read. The other stages exist only on rows written by the archived approval workflow.

Comment-thread resolution: a thread (root `ProgramComment` + its one level of replies) carries `resolvedAt` / `resolvedByUserId` on the root. It may be resolved or reopened by the owning org (proponent STAFF/HEAD), the original commenter, or SUPER_ADMIN. Replies cannot be resolved independently. Endorsement and verdict events are not threads.

Thematic tags (`thematic-tags` module, specs/006): `aip:tag` is a new, narrow
permission key gating `POST`/`DELETE .../thematic-tags` on both a Program and
its PAs — it is **not** `aip:write` plus a role check. `ProgramsService.assertCanTag`
passes for the owning office (same office-scope path as `assertOwner`) **or**
any `identityType = NCPC` user regardless of office, and is symmetric: either
side may remove a tag the other side applied. `aip:tag` is granted to every
template that already carries `aip:write`, and additionally to the `NCPC`
template — which still does **not** carry `aip:write` itself, so this is the
one capability NCPC gained, not a backdoor into general program editing.
Tagging follows the same `isEditableStatus` gate as every other program
mutation, with no exception for any role, including SUPER_ADMIN.

---

## 6. Data Invariants

Service-layer enforced (Postgres CHECK constraints are auxiliary safety nets).

1. **Proponent exclusivity (LGU-only).** Every program has `proponentType = 'LGU'` ⇒ `officeId IS NOT NULL AND civilSocietyOrganizationId IS NULL`. The NCPC proponent track is retired; create rejects non-LGU.
2. **Line total derivation.** `LineItem.lineTotal = LineItem.quantity * LineItem.unitCost`. Recomputed and stamped on every save; client-provided value ignored.
3. **UACS class coherence.** `LineItem.uacsObject.expenseClass = LineItem.expenseClass`. The UACS catalog itself constrains what expense classes a code belongs to.
4. **Climate tag cap and ownership.** A `ClimateChangeTag` has exactly one of `projectActivityId` / `programId` (DB CHECK `climate_change_tags_one_owner`) and 0..n codes (`ClimateChangeTagCode`). `ccaAmount + ccmAmount ≤` the owner's proposed amount — a PA's `proposedBudget` (Σ line items only when it has none), a program's `proposedTotal` — checked on tag save and on line-item mutations of the same PA (`climateBudgetBasis`). Imported tags are written as stated; one above its row's amount is an advisory warning. A tag with an amount and no code is an `INCOMPLETE_DATA` publish blocker, derived on read.
5. **Rollup truth.** `Program.{ps,mooe,fe,co,grand}Total` and `ProjectActivity.{ps,mooe,fe,co,grand}Total` are denormalized caches. They are *truthful with respect to LineItem state* if and only if all mutations go through services that call `BudgetRollupService.recomputeProjectActivity` then `recomputeProgram` in the same Prisma transaction. Direct DB writes that bypass services are forbidden; if they occur, an admin endpoint `POST /admin/recompute-rollups/:programId` restores correctness.
6. **Single finish-line ceiling.** A `FinishLineBudgetCeiling` carries one `totalCeiling` (≥ 0) — the cap `assertCeilingHonored` enforces against the sum of all approved programs in the finish line. (The LGU/CSO split columns and the `CSOSplitType` enum were dropped with the NCPC proponent track.)
7. **Ceiling enforcement at finalization.** At final approval (`PENDING_APPROVAL → APPROVED`, or the no-LFC-members fast path):
   ```
   approvedSum = SUM(Program.grandTotal
                   WHERE aipCycleId = X
                   AND finishLineId = Y
                   AND proponentType = Z
                   AND status = APPROVED
                   AND deletedAt IS NULL)
   require approvedSum + thisProgram.grandTotal ≤ applicableCap(Z)
   ```
   If violated, 409 Conflict with a structured breakdown (available, requested, deficit).
8. **AIP cycle state guard.** All Program mutations require `AIPCycle.status ∈ {OPEN, CLOSED}` for status transitions to fire; structural edits require `OPEN`.
9. **Program soft-delete cascade.** When a Program is soft-deleted (`deletedAt` set), all child ProjectActivities are also soft-deleted in the same transaction. This ensures that deleted programs do not render with stale children in queries that filter `deletedAt IS NULL`.
10. **Counter atomicity (final codes only).** Every `AIPCodeCounter` increment uses Prisma's `update({ data: { nextValue: { increment: 1 } } })` (atomic in Postgres). No app-level read-modify-write. **Tentative codes no longer touch the counter** — they are derived from sibling rank (§7).
11. **Endorsement uniqueness (per-type).** Because the endorser is polymorphic, uniqueness is enforced by **per-type partial unique indexes** (not a single `@@unique`): one `LGU` row per `(version, endorserOfficeId)`, one CSO-rep `NCPC` row per `(version, endorserCsoId)`, and one umbrella-head `NCPC` row per version (where `endorserCsoId IS NULL`). A CHECK constraint enforces the right FK per `endorserType`. Previous versions retain their own rows.
12. **Feedback gate on submit.** `DRAFT | FOR_REVISION → SUBMITTED` is rejected (400) while any *unresolved root comment thread* exists on the program — `count(ProgramComment WHERE parentCommentId IS NULL AND resolvedAt IS NULL) = 0` is required. Because LFC committee returns spawn `APPROVAL`-stage threads — and uninvolved LFC HEADs may post additional ones while the program is in `FOR_REVISION` — a returned program cannot be resubmitted until every thread is resolved. Resolution is per-thread and stamped with `resolvedAt` / `resolvedByUserId`.
13. **Changing any code input resyncs the tentative code.** `Program.officeId`, `papSectorId` and `papClass` are editable via `PATCH /programs/:id` while the program is in an editable status, and each feeds the AIP reference code (§7) — the office supplies `officeType` + `officeCode`, the sector supplies the first segment, and `papClass` supplies segment 5 as well as the bucket the ordinal restarts in. `papSubsectorCode` is **not** a code input any more and does not trigger a resync (it stays immutable after submit for classification reasons, alongside `papSectorId` and `finishLineId`). Any of them changing triggers `resyncTentativeProgramCodes` in the same transaction. When the *scope* changes (office or sector), **both** the old and new scope are resynced — old first, so the vacated ordinal is free before the new scope claims it — and the program is appended at the end of its new scope. `aipReferenceCode` (the final code, issued at publish) is deliberately **not** reconciled; that belongs to the final-code phase. Two scope checks apply: `assertOwner` on the *current* office, and `assertOfficeInScope` on the *target*, so a scoped user cannot move a program out of their own scope and lose access to it. Supporting offices are validated against the **incoming** office, not the stored one.
    > Historical note: only `officeId` used to trigger a re-issue, so a program whose sector changed kept a code naming the old sector. Fixed alongside the derived-code rework. `papSectorId` is separately immutable once `currentVersion > 0`, which limited the blast radius to never-submitted programs.
14. **Committee unanimity (sequential chain).** LFC approval is **sequential**, ordered by `CommitteeMembership.sequenceOrder` — only one office holds a `PENDING` `ProgramApproval` row at any moment. `batchSubmitForApproval` creates the **first** office's row at `HEAD_REVIEWED → PENDING_APPROVAL`. `decideLfcApproval` advances the chain: an `APPROVED` vote creates the **next** office's `PENDING` row (program stays `PENDING_APPROVAL`), or runs `finalizeApproval` → `APPROVED` when the last office approves. A `RETURNED` vote sends the program to `FOR_REVISION` (recoverable) and a `REJECTED` vote sends it to `REJECTED` (terminal); either stops the chain (no further rows are created). Unanimity is the *outcome* — every member office must approve to finalize — reached one office at a time. Stale rows from prior versions are purged when a new gate opens. `@@unique([programVersionId, committeeId, officeId])` enforces one row per `(version, committee, member office)`; retrying `batchSubmitForApproval` is idempotent.
15. **Office codes are free text and deliberately NOT unique.** `Office.officeCode` carries no unique constraint. The city's coding sheet assigns codes by hand, numbers them globally (`01`–`17` mandatory, `18`–`21` optional, `22`–`55` others), and disambiguates two offices sharing a base code with a parenthetical suffix — `11` CHO and `11 (1)` CHO II. It also puts several offices under one code on purpose: CMO-NCYDO, CMO-MNDC and CMO-SPORTS all sit on CMO's `01`. Offices sharing a code **and** type emit byte-identical AIP reference codes; the office form warns and names the other office, but does not block. Reads order by `[officeType, officeCode]` with nulls last (Postgres sorts the enum by declaration order, `MANDATORY → OPTIONAL → OTHERS`, matching the office-type segment `01`/`02`/`03`). The code is emitted verbatim with internal whitespace stripped, so `11 (1)` prints as `11(1)` — the column keeps the sheet's spelling, only the segment is normalised.
16. **Tentative ordinals are ranks, and renumbering is a two-pass write.** The program and PA ordinal segments are the row's rank among live siblings, not a stored counter value (§7). Programs rank by `papClass` (GAS → STO → Operations, nulls last) before `orderIndex`, matching the registry's list order, and **the ordinal restarts inside each `papClass`** — a null `papClass` shares the Operations bucket, since both emit segment `003`. Any event that changes the population or the order — create, delete, drag-reorder, office/sector change, office code or type edit, **or a `papClass` change** — reruns `resyncTentativeProgramCodes` / `resyncTentativePACodes` inside the caller's transaction. Because `tentativeAipReferenceCode` is unique per cycle, a renumber that shifts `002→001, 003→002` would collide mid-update, so every changed row is first parked on a `~{id}` sentinel and only then written to its real code. **The park spans every reranked program's PAs, not one program at a time** — when two programs swap ranks, program A's new PA codes are exactly the codes program B's PAs still hold, and a per-program park collides on the unique index.

    Two callers pass `{ force: true }`, and both are cases where there is no existing code to protect: `prisma/restate-aip-codes.ts` (a format change moves every code) and `ProgramPublishService.restoreFromSnapshot` (the PA subtree was just rebuilt onto `~{id}` sentinels). Everything else goes through the ordinary path.
17. **Reorder payloads must be complete and single-scope.** `PATCH /programs/reorder` requires every program in one `(cycle, office, papSector)` scope exactly once; a cross-scope payload is rejected because the ordinal restarts per scope — and, within a scope, per `papClass` — so the codes could not follow the drag. `PATCH /programs/:programId/project-activities/reorder` requires every sibling under one parent (`parentProjectActivityId: null` = the program's root level). Partial lists are rejected rather than accepted: an omitted row keeps a stale rank and then jumps on the next unrelated resync, which reads as corruption. Both write 1-based `orderIndex` in payload order, resync, and return the rows with their new codes.
18. **Frozen rows reserve their ordinal (skip-over).** `resyncTentativeProgramCodes` never rewrites a program that is `APPROVED` or sits in a cycle that is not `OPEN`. Those ordinals are *reserved*: movable siblings step over them rather than renumbering into a code that is still taken, which would violate the unique index and abort the transaction. The consequence is a gap in a scope's tentative ordinals once anything in it is frozen. **This is the settled policy** (#85): under the publish model nothing in an `OPEN` cycle is `APPROVED` and a cycle freezes all its programs at once, so the reservation does not fire today, and a gap could only ever show on a never-published program — every view prefers the final `aipReferenceCode`, which is counter-issued at first publish and never reassigned. Rationale and the rejected alternatives (compact, freeze-the-scope): `docs/design/tentative-aip-code-rework.md` §2.
19. **Relation-array tags replace, and are outside the audit trail.** `sdgGoalIds` and `supportingOfficeIds` are **set-replace**, not merge: sending the field at all wipes the junction rows and recreates them (omit the field to leave the set alone; send `[]` to clear it). Ids are validated against the *unique* count before the write, so a duplicate id fails validation rather than hitting a composite-PK violation mid-transaction. Both fields sit outside `PROGRAM_AUDIT_FIELDS` (a scalar allow-list) and outside `ProgramVersion.snapshot`, so changing them writes no history row and survives a discarded revision untouched. Bringing relation arrays into the audit diff and the snapshot is one change covering every junction field; it has not been made.
20. **A warning is stored only if it cannot be re-derived *and* is about that row.** `Program.importWarnings` holds exactly the three things the 2027 workbook import *decided* — an inferred finish line, a duplicate merge, a synthesised heading — because each leaves the row looking identical to one authored on purpose, so no later read can detect it. The second half of the rule is what AB 2026 taught: its inferred finish line was equally unre-derivable, but the book states a finish line **nowhere**, so all 430 programs carried the same sentence and `INCOMPLETE_IMPORT` gated the entire enacted budget while distinguishing nothing within it — a reviewer would have confirmed one fact 430 times. A condition that holds for every row is a property of the source, not a decision about a row: report it once (the seed's output and the import report) and store nothing. Removing it took the 2026 cycle from **0 publishable to 383**, leaving the 47 rows with genuinely row-specific warnings gated. Non-empty blocks publishing (`INCOMPLETE_IMPORT`) and is cleared only by `POST /programs/:id/acknowledge-import` (`aip:publish` + office in scope), which logs `IMPORT_REVIEWED` with the cleared sentences in `changes` — the only surviving record of them. Everything else that used to live here is **derived per read** by `deriveDataWarnings` (`src/programs/import-data-warnings.ts`) and returned in two places: `readinessFor`'s advisory `warnings` array, and `dataWarnings` on each AIP registry list row. Either way the checks are the same — a leaf PPA with no amount, funding source, expected output or dates (explaining `ZERO_PROPOSED_BUDGET` / `INCOMPLETE_DATA` in words), plus two advisory-only checks: a null `papClass`, and a PS+MOOE+FE+CO split more than a centavo off its stated total. **Funding source and expected output never block publishing** (specs/013, decided for the 2027 launch: the city's workbook leaves 100 and 277 leaves blank). They stay advisory sentences, the public page reads "Not yet stated", and staff keep the row's ⚠ until an office fills them in. For a historical cycle — `isHistoricalCycle(fiscalYear)`, true at or before `LAST_HISTORICAL_FISCAL_YEAR` (2026) — even the sentence is suppressed, because the enacted book states neither for most rows. A program that states its own costs gets the same sentences about its own row (`ownRow`), which used to be silent. The implementation period still blocks. Blank 2027 periods were filled with January–December 2027 by `prisma/default-implementation-dates.ts`, as agreed with the city on 2026-10-26. None of them block. The rule exists because breaking it caused a real bug: storing data gaps meant the sentence outlived the fix, so 145 of 225 seeded programs stayed unpublishable no matter what their office corrected. `deriveDataWarnings` is passed the caller's **leaf set** rather than recomputing it, and both callers get that set from the shared `leavesOf` — a row every PPA nothing else names as parent — so a sentence and the blocker it explains can never disagree about what a leaf is. `leavesOf` reads the actual child set, never `costMode`, which is also what makes `EMPTY_PARENT_PPA` expressible as "a cost-derived leaf".

21. **A per-fund split is the row's money, not a second figure.** `FundAllocation` lines (one per fund, unique per owner, exactly one of `programId`/`projectActivityId` — DB CHECK) exist only on a row that states its own costs. `EstimateRollupService` derives the owner's PS/MOOE/FE/CO and `fundSources` from them (a PA's `proposedBudget`, a program's `proposedTotal` follow), so every reader of the estimate family stays correct; a row switching to `ACTIVITY_CHILDREN` loses its split in the same rollup. Writes go through `replaceFundAllocations` (`[]` = back to one total) followed by the rollup, in one transaction. Fund attribution — public overview, staff dashboard, the complete export's Fund Source sheet — reads the lines exactly; an unsplit multi-fund row still goes to the multiple-funds bucket. The exports print a split row one line per fund.

---

22. **A special fund's stated amount is staff-only, and the program sum wins.** `FundStatedAmount` (one per special fund and cycle, `statedAmount ≥ 0`, Super Admin only) is the figure the General Fund's LBP Form 7 prints for a fund no row carries. When rows under any office carry it, their sum is the figure, and a different stated amount is flagged `STATED_DIFFERS`; a stated amount with no programs is flagged `STATED_WITHOUT_PPAS` — both derived on read (invariant 20). **No public or open-data path reads this table**: public totals and open data are program sums only. It shows on Form 7, the staff dashboard, the registry and the cycle's control-panel page.
23. **LBP forms attribute money by fund the way everything else does, and read money on leaves only.** `lbp-figures.ts` gives one normaliser for a live row or a `ProgramVersion.snapshot` (published figures), and one attribution rule (invariant 21): a split row's fund line, a single-fund row whose fund it is, a no-fund row counted as General Fund (listed), an unsplit multi-fund row on no fund's form (listed). The row model (`office-sheet.ts`, shared with the Word Annual Budget) prints money on leaf PPAs only — a parent prints its name and no amount — so a nested program is never counted twice. Summed over every fund, Form 4 plus the listed multi-fund rows equals the cycle's `proposedTotal` sum to the centavo (checked on the 2027 and 2026 cycles).

24. **A Budget Document PPA's money is its own; its total is derived (specs/012, ADR 0004).** An LEP or Ordinance PPA (`BudgetItem`) stores its **own** PS/MOOE/FE/CO, as the city's book prints it, and `total` = own + Σ children's totals, written only by `BudgetDocumentsService.recomputeTotals`. A document's total is the Σ of its roots' totals. `rootItemId` names the tree's root (a root's own id); a DB CHECK keeps a root self-rooted and a child not, and `recomputeTotals` refuses a child whose root differs from its parent's. Readers that expect the AIP shape go through `asProgramView` (`budget-item-view.ts`), which gives a parent with own money one synthetic leaf (`<id>~own`) so leaf-summing readers (LBP forms) count it exactly once.

25. **A Budget Document is frozen once final, and nothing unreviewed goes public.** DRAFT → SUBMITTED (LEP) or ENACTED (Ordinance) via `POST /budget-documents/:id/finalize`; anything but DRAFT refuses every write (`DOCUMENT_FROZEN`) and there is no reopen. `BudgetItem.importWarnings` follows invariant 20 (only decisions the import made about that row); finalizing is refused (`DOCUMENT_HAS_IMPORT_WARNINGS`, listing the rows) while any row has one whenever it makes the document public — an Ordinance always, and an LEP of a historical year, which the Annual section then serves (specs/017 FR-002) — and `POST …/items/:itemId/acknowledge-import` clears them while DRAFT. The rest of a book (specs/017: receipts, by-object lines, Forms 5–6), written onto an already-public document by `--backfill-sections`, follows the same rule: an OCR sections file whose report lists problems is refused unless a reviewer passes `--accept-problems`. Every action writes a `BudgetDocumentAuditLog` row.

26. **A comment hangs off an AIP program or a document PPA, never both.** `ProgramComment.programId` / `budgetItemId`, exactly one set (DB CHECK). Every path that touches an existing comment checks access through `CommentsService.assertCanReadTarget`, which applies the program read rule (`ProgramsService.canReadOffice`) to the PPA's office or its host office; a document-PPA comment's resolve/delete/restore is recorded in the document's history, not the program audit log.

27. **An ARCHIVED program counts nowhere, and `LIVE_PROGRAM` / `PUBLICLY_VISIBLE` are the only "live" predicates (specs/013).** `ProgramStatus.ARCHIVED` is entered only from `PUBLISHED` and left only to `DRAFT`. Both moves need SUPER_ADMIN and a reason (`POST /programs/:id/archive` | `unarchive`, audited `ARCHIVED` / `UNARCHIVED`). An archived row keeps its `publishedVersionId`, versions, comments and fund and climate rows, so any query keyed on `deletedAt: null` or `publishedVersionId != null` alone still counts it. Every list, total, export, LBP form, ceiling check, code scope and public read therefore goes through `src/programs/program-filters.ts`: `LIVE_PROGRAM` for staff reads, `PUBLICLY_VISIBLE` (which includes it) for anything the public lists, totals or downloads. `PUBLICLY_READABLE` exists for exactly one purpose: the archived program's own link, versions and existing feedback stay readable (`archived: { at, reason }` on the detail). Public feedback and staff comments on it are refused. Archiving parks the tentative code on `~<id>` and resyncs the scope, as `softDelete` does. The published snapshot keeps the old code, and a final `aipReferenceCode` once issued is never reused. `ADOPTABLE_PROGRAM_STATUSES` includes ARCHIVED, so an archived program never holds an AIP open.

28. **A cycle's stated enacted total is a headline, never a sum.** `BudgetCycle.statedTotal` and its parts `statedOfficeTotal` + `statedSpecialTotal` hold what an enacted ordinance states. A DB CHECK requires the parts to be null or to add up to the total. FY2026 is Ord. 2025-131: ₱2,122,357,059 = ₱1,664,699,680 office appropriations + ₱457,657,379 Special Purpose Appropriations, which already contain LDF and LDRRMF. It is served on `GET /public/cycles` and shown only as the Annual page's headline and in the next year's AIP reading guide. No aggregate, browse table or open-data file adds it. Since specs/016 the FY2026 Ordinance seeds the SPA, LDF and LDRRMF rows too, so once it is enacted its rows sum to the same ₱2,122,357,059 the headline states. The Annual Overview shows it only while the year has no enacted Ordinance (`hasEnactedOrdinance` on `GET /public/cycles`); after that the headline is the rows' sum. It is not `FundStatedAmount` (invariant 22), which is staff-only and per special fund.

29. **Every special-fund row has a real office, settled at import (specs/016 FR-002/003).** A row charged to SPA, LDF or LDRRMF is an ordinary row under the office that runs it, with the fund on its fund source (`BudgetItem.fundSource`, or `fundSources` on a Program/PA). Its office is settled in order: (1) the office segment of the row's own code, when that names a real office; (2) the checked-in mapping `api/prisma/data/special-fund-offices-<fy>.json` (keyed by printed code, each entry with its `basis`, confirmed by the CBO); (3) otherwise the seed **stops** — every PPA needs an office, so there is no placeholder to warn on. A mapped row carries no import warning; the CBO reviews the file instead. The retired `LDF`, `SPAF` and `LDRRMF` offices (`isActive = false`) are never assigned. A year with no mapping file leaves its special-fund sheets out. Public pages are office-first: a badge on the row, the registry's fund filter, and a page per special fund that reads `FundRule` (`GET /public/fund-rules/:fund?year=`).

30. **Receipts and printed totals are the book's other side, never a sum of the budget (specs/017).** `BudgetReceiptLine` is the Receipts Program as printed. Headings hold the sum the book prints for them, and the money is on the leaves. Lines with `officeId` null are the General Fund's program. An enterprise's own sheet (`officeId` = NCGH, MEPO, …) restates part of it and is never added to it. `BudgetPrintedTotal` (Form 7, the summaries, the PS ceiling, each sheet's TOTAL) is only for checking derived sums. No aggregate, public total or open-data file adds either one. Book lines resolve their printed code to `ChartAccount`, COA's LGU chart keyed by the printed 8-digit code, as account + `subCode` (the city's suffix). `UACSObject` stays the AIP's picker list of expense objects. Its 12 capital-outlay rows were re-coded in place to the LGU chart (`1-06-04-010` → `1-07-04-010`; `1-07-01-010` was Land), ids unchanged.

## 7. AIP Reference Code Reference

### Two-phase model

- **Tentative code** (`tentativeAipReferenceCode`): **derived**, not issued. Every segment is recomputed from current state, so the code tracks the data instead of freezing a snapshot of it. Visible in the UI immediately; changes when the data behind it changes.
- **Final code** (`aipReferenceCode`): assigned at **first publish** (`ProgramPublishService.publishOne`; the archived approval workflow assigned it at `PENDING_APPROVAL → APPROVED`). Chronological in publish order. Immutable after assignment. Still counter-issued via `AIPCodeCounter`.

### How the tentative ordinal is derived

The ordinal is a **rank among live siblings**, not a stored counter:

```
ordinal(program) = its 1-based position among live programs sharing
                   (aipCycleId, officeId, papSectorId),
                   ordered by (papClass, orderIndex, createdAt)

ordinal(PA)      = its 1-based position among live siblings sharing
                   (programId, parentProjectActivityId),
                   ordered by (orderIndex, createdAt)
```

`Program.orderIndex` and `ProjectActivity.orderIndex` are the user-controlled rank, written by the reorder endpoints; `createdAt` breaks ties for rows that have never been reordered.

**Programs rank by AIP form section first.** `papClass` sorts ascending — the enum is declared `GAS, STO, OPERATIONS`, which is the form's own I/II/III section order — with nulls last. This is not a preference: it is the order `AIPRegistryService.list` renders in, and the two must agree or the codes print out of sequence in the very table that shows them. The 2027 workbook made that concrete — PSO wrote two GAS/STO/Operations blocks under one office, and ranking by `orderIndex` alone numbered them `001, 007, 002, 008, 003…` down the registry page. If you change one ordering, change both.

Every behaviour falls out of that one rule rather than a special case each:

| Event | Why the code changes |
|---|---|
| Program or PA deleted | siblings re-rank, closing the gap |
| Row dragged in the UI | `orderIndex` changes, so ranks change |
| Office code or type edited | the `officeCode` / `officeType` segments change |
| `papSectorId` changed | the first segment changes, and so does the ordinal's scope |
| `papClass` changed | segment 5 changes, and the ordinal restarts in a different section |
| Program's implementing office changed | office segments **and** the ordinal scope change |
| New program or PA created | appended at the end of its scope |

The value is still **stored** in `tentativeAipReferenceCode` — ~40 read sites depend on it (registry search `contains`, exports, public views, `orderBy`) and it is `@unique`. It is derived state written by one resync function, never a value issued at create time. Creates write a `~{uuid}` placeholder and let the resync fill in the real code inside the same transaction.

See §6 invariants 16–18 for the two-pass write, the reorder payload rules, and the frozen-row skip-over.

### LGU format (7 segments, hyphen-separated)

This is the city's own format, as printed in the Annual Budget and defined by
their coding sheet. It replaced an earlier layout in August 2026 — see
`docs/design/aip-code-format-realignment.md`.

```
{papSector-4} - {lguLevel-1} - {officeType-2} - {officeCode} - {papClass-3} - {programCounter-3} - {paCounter-3}
```

Example: `1000-2-02-18-001-000-000` — General Public Services / city-level /
optional office / office 18 (CEPPIO) / GAS / the section heading row / not-a-PA.

Two things about this format catch people out:

- **`papClass` is segment 5**, and the program counter **restarts inside each
  section**: GAS runs `001…`, STO restarts at `001`, Operations restarts at
  `001`. A program with no `papClass` emits the Operations segment and shares
  its numbering, because two rows emitting the same segment would otherwise both
  be handed `001`.
- **`officeCode` is emitted verbatim, unpadded**, with internal whitespace
  stripped. The sheet numbers offices 2-wide (`18`) and disambiguates
  sub-offices with a parenthetical suffix, which it writes with a space
  (`11 (1)`) and prints without one (`…-11(1)-…`).

The city's book also uses `004` in the papClass segment for component programs
budgeted under a host office. **We never emit it** — a component program keeps
its own office's code and prints inside the host's sheet by way of
`Program.hostOfficeId`. AB 2026's `004` codes are imported verbatim.

**Top-level PA codes** (a Project/Activity that is a direct child of the Program) copy the parent
Program's first 6 segments and fill the last (`-000` → `-001`, `-002`, …).

**Nested activity codes** (an Activity whose `parentProjectActivityId` points at a Project) append a
2-digit `-NN` sub-segment to the parent Project's code, numbered per-parent:

```
1000-2-02-18-003-001-001        ← project (top-level PA)
1000-2-02-18-003-001-001-01     ← activity nested under that project
1000-2-02-18-003-001-001-02     ← next activity under the same project
1000-2-02-18-003-001-002        ← next top-level PA (program-scoped counter unaffected by nesting)
```

### Codes are unique per cycle, not globally

The format carries no year, so the city reissues the same strings every fiscal
year — 2026's `3000-2-01-11(1)-003-001-000` is byte-identical to 2027's. The
unique indexes are therefore scoped:

| Table | Unique on |
|---|---|
| `programs` | `(aipCycleId, tentativeAipReferenceCode)`, `(aipCycleId, aipReferenceCode)` |
| `project_activities` | `(programId, tentativeAipReferenceCode)`, `(programId, aipReferenceCode)` |

A PA scopes to its program rather than to the cycle because its code embeds the
program's: two PAs can only ever collide inside one program, which is exactly the
resync bug the constraint exists to catch.

### NCPC format (removed)

The NCPC 6-segment format (`NCPC-{papSector}-{papSubsector}-{csoCode}-{program}-{pa}`)
was **retired with the NCPC proponent track**. `AIPCodesService` issues only the
LGU 7-segment format; the NCPC formatter and `proponentType` inputs have been
removed. Counter scope keys keep the literal `:LGU:` segment so existing
counters stay stable.

### Counter scopes (final phase only)

- LGU Program final: `${cycleId}:LGU:${officeId}:${papSectorId}:${papClassCode}:final`
- Top-level PA final: `${programId}:final` (initialized when parent Program first reaches APPROVED)
- Nested activity final: `pa-child:${parentProjectActivityId}:final`

The matching `:tentative` scope keys are **dead**. `AIPCodeCounter` rows for them may still exist in older databases and are simply never read; `issueTentativeProgramCode`, `issueTentativePACode` and `peek` were deleted so there is exactly one mechanism producing a tentative code.

### Where segments come from

| Segment | Source |
|---|---|
| `papSector` | `Program.papSector.code` |
| `lguLevel` | `Program.office.lguLevel` (always `2` = City) |
| `officeType` | `Program.office.officeType` → mapped (MANDATORY=`01`, OPTIONAL=`02`, OTHERS=`03`) |
| `officeCode` | `Program.office.officeCode`, verbatim with internal whitespace stripped — no padding (`18`, `11(1)`) |
| `papClass` | `Program.papClass` → mapped (GAS=`001`, STO=`002`, OPERATIONS=`003`); null emits `003`. `004` is the city's component bucket and is never generated. |
| `programCounter` | **Tentative:** rank among live siblings in `(cycle, office, papSector)` by `(papClass, orderIndex, createdAt)`, restarting within each papClass. **Final:** `AIPCodeCounter`. |
| `paCounter` | **Tentative:** rank among live siblings in `(programId, parentProjectActivityId)` by `(orderIndex, createdAt)`. **Final:** `AIPCodeCounter`. |

### Previewing a code the row does not have yet

Both create forms show the code a row *would* get before it exists, and both
read it from the server — `POST /aip-codes/preview` for a program,
`POST /aip-codes/preview-pa` for a project/activity. Neither is a counter peek:
each counts the live siblings that would sort ahead of the new row and returns
"one past them", exactly the rank the resync would assign, so the code shown is
the code saved.

A preview is only correct if it is given every input that reaches the code.
Both have been wrong here in practice:

- `previewProgramCode` takes `papClass`. It is segment 5 **and** the bucket the
  ordinal restarts in, so omitting it does not merely blank a segment — the
  preview emits `003` and counts the wrong siblings.
- `previewPACode` takes `parentProjectActivityId`. Absent, the code is the
  program's with its trailing slot filled (`…-001-001`); present, it is the
  parent PA's code plus a 2-digit segment (`…-001-001-01`).

**Never build either code client-side.** The ordinal is a rank over rows the
browser cannot see; the add-PA form once pasted `-000` onto the program's code
and showed `…-000` no matter how many project/activities already existed.

> **`Program.papSubsectorCode` is not in this table any more.** The realignment
> replaced that segment with `papClass`. The column is kept — it is real DBM
> classification data and it lives inside `ProgramVersion.snapshot` — but editing
> it no longer restates anything, so it is not a resync trigger.
>
> **`Program.hostOfficeId` is not a segment either.** A component program's code
> names its own office, exactly as the city's book does: City Health Office II's
> programs carry `11(1)` while printing inside CHO's sheet.

> **`Office.papSector` is not in this table, deliberately.** The sector segment
> comes from `Program.papSectorId`. An office's `papSectorId` only pre-selects
> the sector field on the new-program form, so editing it never restates a code
> — `ReferenceService.updateOffice` resyncs on `officeCode` / `officeType` only.

---

## 8. Reference Data Catalog

| Table | Seed source | Maintenance | Annual reseed? |
|---|---|---|---|
| `PAPSector` | DBM BOM Annex 2 | CRUD via control panel + seed | Rare (DBM-driven) |
| `Office` | The LGU's AIP coding sheet (`prisma/data/<city folder>/offices.json`) | CRUD at **Control Panel → Offices** + seed | When the city reissues codes |
| `UACSObject` | DBM UACS catalog (current year) | CRUD via control panel + seed | Yes (when DBM publishes) |
| `ClimateTypologyCode` | DBM-CCC CCET joint memo | CRUD via control panel + seed | When memo revised |
| `SGLGIndicator` | DILG SGLG framework (current year) | CRUD via control panel + seed | Yes (DILG-driven) |
| `SDGGoal` | UN 2030 Agenda (17 goals) | CRUD via control panel + seed | No (fixed until 2030) |
| `CivilSocietyOrganization` | SUPER_ADMIN-assigned | CRUD via control panel | On CSO onboarding |
| `Cluster` | The LGU's strategic plan | CRUD via control panel + seed | Rare |
| `FinishLine` | The LGU's strategic plan | SUPER_ADMIN (seed-only) | Rare (every multi-year planning cycle) |

Seed data files live in `api/prisma/data/` as JSON. All seeds are idempotent (`upsert` by `code`). For tables with full CRUD, use the control panel for day-to-day changes; reseed from JSON for bulk initial loads or environment refreshes. Deprecated records get `isActive=false` rather than being deleted.

`prisma/data/offices.check.ts` (`npx tsx prisma/data/offices.check.ts`) is an
assert-based guard over `offices.json` — cluster and sector references, the
rename map, the *intentional* office-code collisions, and the AIP sector-group
overrides.

> **`Office.aipSectorGroup` is an override, not the rule.** It decides which
> sheet an office prints on in the complete-AIP workbook
> (`GET /aip-registry/exports/complete`). Nullable and normally null:
> `resolveSectorGroup` derives the group from the office's PAP sector —
> `1000`/`9000` → General Public, `3000`/`4000`/`5000` → Social, `6000`/`8000` →
> Economic, uncoded → General Public — so a newly added office lands on a sheet
> rather than vanishing from the city total.
>
> The column exists because the budget office's four-way split is **editorial**:
> it cuts across `PAPSector` (only three of the seven are in use) and across
> `Cluster` (eight), so neither can derive it. Nine offices are filed against
> their sector — `CENRO`/`SWMO`/`CEO`/`CPRFMO` → `ENVI_INFRA`,
> `NCGH`/`OLLI`/`OSCA`/`PDAO` → `SOCIAL`, `NCCDO` → `ECONOMIC`. That set is
> pinned in `offices.check.ts`, because an override added or dropped moves an
> office's money to another sheet **without changing the city total** — the sheet
> totals alone would not reveal it. Not a code segment, so writing it triggers no
> AIP-code resync.

> **A shared `officeCode` + `officeType` breaks AIP codes.** Both are code
> segments (§7) and nothing else in the format separates two offices carrying the
> same pair, so their first programs derive the **same** tentative code and the
> second fails on the unique index. It only bites once two such offices each hold
> a program in the same cycle. `CMO-MNDC` and `CMO-SPORTS` still share
> `01`/MANDATORY with `CMO`; neither has a program today. Add a new office with a
> duplicate pair and `offices.check.ts` fails on purpose.

### AIP program data (not reference data)

| File | Contents | Produced by |
|---|---|---|
| `data/aip-2027.json` | The original 12 hand-written programs | by hand |
| `data/aip-2027-workbook.json` | 188 programs from the city’s 2027 workbook | `prisma/import-aip-2027-xlsx.ts` |

The workbook itself is **not committed** (gitignored — a large binary that arrives
revised). Regenerate the JSON with `pnpm --filter api db:import:2027`, review
`docs/design/aip-2027-import-report.md`, then `db:seed:2027`. Both seed scripts run
under **tsx**, not ts-node, because they import `AIPCodesService` and
`EstimateRollupService` — resolving a Nest service's `.js` specifiers needs it.
Background: `docs/design/aip-2027-workbook-import.md`.

---

## 9. Money & Numeric Conventions

- All monetary columns use Prisma `Decimal @db.Decimal(18, 2)`. Two decimal places, peso semantics.
- Quantities use `Decimal @db.Decimal(14, 2)` to support fractional units (`0.5 lot`, `1.25 month`).
- Prisma returns `Decimal.js` instances in the service layer. **Do not** coerce to `Number` — use `.add`, `.sub`, `.mul` methods.
- JSON serialization renders Decimal as strings. Frontend consumers should use a Decimal library (e.g., `decimal.js` or `dinero.js`) for arithmetic, not native `Number`.

---

## 10. Conventions

- **Module style.** Feature module = `{feature}/` with `{feature}.controller.ts`, `{feature}.service.ts`, `{feature}.module.ts`, and a `dto/` subdir. Cross-cutting services (like `BudgetRollupService`) live in their own module and are imported where needed.
- **Prisma access.** Always inject `PrismaService`. Never instantiate `PrismaClient` directly. Use the v7 import pattern: `import { ... } from 'generated/prisma/index'`.
- **DTO validation.** Use class-validator decorators. The global ValidationPipe (`main.ts`) enforces whitelist + transform.
- **Errors.** Throw NestJS exceptions: `BadRequestException` for client errors, `ForbiddenException` for RBAC, `ConflictException` for state conflicts (e.g., ceiling exceeded), `NotFoundException` for missing entities. The global filter normalizes to the API error shape.
- **Auth.** All routes require JWT by default (`JwtGuard` is `APP_GUARD`-registered). Add `@Public()` to opt-out; add `@Roles(...)` to restrict by role; use `@CurrentUser()` to inject the `JwtPayload`.
- **Transactions.** Any mutation that touches two or more tables — or that must remain consistent with a rollup recompute — uses `prisma.$transaction(async (tx) => {...})`. Pass `tx` into helper services that need to participate.
- **Snapshots.** `ProgramVersion.snapshot` is a Postgres `jsonb` column. Read-only. The shape mirrors the live tree at the time of submit. Old snapshots are intentionally resilient to live-schema additions — new fields simply don't appear in old snapshots.
- **Naming.** Tables `snake_case` via `@@map`. Columns `snake_case` via `@map`. Model and field names in TypeScript stay `PascalCase` / `camelCase`. Enums all-caps.
- **Soft-delete.** Only `Program` is soft-deleted (`deletedAt: DateTime?`). `ProjectActivity` and `LineItem` are hard-deleted, and only while parent Program is in `DRAFT` or `FOR_REVISION`. All read queries filter `deletedAt IS NULL` unless explicitly fetching deleted records (admin-only).
- **Audit trail.** Decision events (`ProgramVerdict`, `ProgramEndorsement` state changes, `ProgramApproval` state changes, `FinishLineBudgetCeilingHistory`) are append-only. Comments are mutable by author until deleted.

---

## 11. Reading Map

If you're new to the codebase, read in this order:

1. `api/prisma/schema.prisma` — the canonical data model
2. `docs/architecture/overview.md` — how the system fits together
3. `api/src/auth/decorators/` and `api/src/auth/guards/` — how RBAC works
4. `api/src/reference/reference.service.ts` — example of the controller/service pattern
5. `docs/modules/` — per-module developer reference (start with `programs.md`)
6. This document — domain reference and invariants
7. `docs/architecture/frontend.md` — the frontend's view of the same features (helps reconcile terminology)

---

## 12. Open Items Not in MVP

These are intentionally deferred. Don't model them; don't pre-bake hooks for them unless the cost is zero.

- Domain-scoped endorsement (e.g., GAD only endorses gender-tagged programs)
- Multi-stage HEAD review (currently a single HEAD action)
- Procurement integration (contracts attached to Project entities)
- Sangguniang Panlungsod submission workflow
- Amendment workflow for APPROVED programs in a LOCKED cycle
- Project → Activity nesting (column reserved; not used)
- Inline comments on `PROJECT_ACTIVITY` and `LINE_ITEM` targets (columns reserved; only `PROGRAM` writes accepted)
- Edit window for comments (comments are immutable after create in MVP)
- Drift-detection cron for budget rollups (admin endpoint exists for manual recompute)
- Additional committees beyond the LFC. The `Committee` + `CommitteeMembership` schema supports many-to-many; the workflow currently keys only on the LFC. Generalising the gate to arbitrary committees is a workflow change with no schema migration.
- Committee-membership admin UI (`Committee` and `CommitteeMembership` rows are seed-managed today).
