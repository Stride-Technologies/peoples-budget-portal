# Managing the AIP — Illustrated

Screens for creating, drafting, publishing, exporting, viewing, commenting on,
editing, and tracking the history of AIP entries.

For the workflow behind these screens, read
[phase-1-encoding.md](phase-1-encoding.md) first.

---

## The AIP Registry

**AIP Registry** in the top navigation (`/aip-registry`) is the working view of
every entry for the fiscal year. The address bar follows what you open — for example
`/aip-registry/2027/program/…` while a program is open — so you can copy the link to
share it, and the browser's Back button closes the panel.

| | |
|---|---|
| **1** | **Export** — the AIP workbook |
| **2** | **Publish cluster** — publish a whole cluster at once |
| **3** | **New Program** — start a new AIP entry |
| **4** | Status filters: **All · Drafts · Needs publishing · Published** |
| **5** | Filter by **finish line** (FL1–FL8) |
| **6** | Filter by **cluster** |

The table lists each Program with its Projects and Activities nested beneath it.
Columns: **Program / Project / Activity · Finish Lines · EO/MFO · Status · PS ·
MOOE · CO · Total · Actions**. Money is shown in millions; a **Grand Total** row
sits at the bottom with page and overall totals.

**Full** and **Compact** switch row density. The eye icon on each row opens the
overview drawer.

---

## Creating an entry

**New Program** opens the entry form in a drawer, without leaving the registry.

| | |
|---|---|
| **1** | **0 of 5 required fields** — the progress counter |
| **2** | **Program Name** — required; auto-capitalized when you leave the field |
| **3** | **Implementing Office / Organization** — the first office is the primary one and sets the sector |
| **4** | **AIP Reference Code** — generated, not typed |

The program name is title-cased for you when you tab out of the field, so a name
pasted out of a spreadsheet in ALL CAPS comes back readable:

> `CONSTRUCTION OF BARANGAY HEALTH CENTER` → `Construction of Barangay Health Center`

Every word gets a capital letter and the rest of the word is lowercased, except
articles, conjunctions, and short prepositions (`of`, `for`, `the`, `and`, …),
which stay lowercase unless they start or end the name. Casing that is clearly
deliberate is kept: known acronyms (CPDO, DRRM, LGU, MOOE, GAD…) stay in caps —
and are *promoted* to caps if you typed them lowercase — as do roman numerals
(`Phase II`) and mixed-case words like `CAgO` or `eGovernance`. You can always
edit the result by hand afterwards.

If a name of yours gets mangled, it is an acronym we have not listed yet — tell
the administrator and it takes a one-line change.

Other fields on the form:

- **Implementation Period** — start and end month. Child projects and activities
  must fall inside it, and the earliest allowed year is the FY of the cycle.
- **Sector** — auto-tagged from the primary implementing office.
- **Primary Finish Line** — required.
- **Sustainable Development Goals (SDG)**, **SGLG Indicator**, **Expected Output / MFO**, **Remarks / Justification** — optional. SDG accepts any number of goals; the rest take a single value.

The reference code is assembled as
`Sector - Subsector - LGU Level - Office Type - Office - Program - Project/Activity`.
Until the entry is published this is a **tentative** code — it can shift if the
office, sector, or ordering changes. The final code is assigned on first publish
and never changes afterwards.

### Adding Projects and Activities

From the drawer or the row actions: **Add Project / Activity** on a program, and
**+ Activity** on a project. For each PPA you enter amounts against the expense
classes:

| Class | Covers |
|---|---|
| **PS** | Personnel Services |
| **MOOE** | Maintenance and Other Operating Expenses |
| **CO** | Capital Outlay |

The **Proposed Budget** is the sum of the three — you don't type it. At least
one class must be non-zero.

Everything stays a draft until someone publishes.

---

## Viewing an entry

The eye icon opens the overview drawer.

| | |
|---|---|
| **1** | Status of this entry |
| **2–5** | **Details · Comments · Public Feedback · History** |
| **6** | Administrative details — office, sector, implementation period, created/updated dates |

Below the tabs: the description, the expected output, the finish lines, and
**Sub-items** — every Project and Activity with its PS / MOOE / CO breakdown and
total.

---

## Publishing

Publishing makes an entry public and assigns its **final AIP reference code**.

**Publish cluster** publishes everything ready in one cluster:

| | |
|---|---|
| **1** | *"This makes 2 AIP entries public. Final AIP reference codes are assigned on first publish and never change afterwards."* |
| **2** | Readiness: **2 ready · 0 blocked** — blocked entries are skipped, not failed |
| **3** | Open comments are shown as **"won't block"** |
| **4** | **Publish N entries** — only the ready ones go out |

Before an entry counts as ready it needs at least one Project or Activity, a
proposed budget above zero on every one of them, and implementation dates. A
missing **funding source** or **expected output** does not hold it back: the
public page shows "Not yet stated", and the entry keeps its ⚠ marker in the
registry until someone fills it in. A **budget ceiling warning**
may also appear if the finish line has a ceiling and publishing would exceed it —
advisory only, it does not block.

Without `aip:publish` the button is visible but disabled, with the reason shown.
Prepare the entry and ask a CPDO Head.

> **Publishing is permanent.** There is no unpublish. Each publish creates a new
> version, kept forever.

### Archiving an entry that has been replaced

Sometimes a published entry is replaced by a newer one. For example, the 12
programs published before the city's 2027 workbook was imported were replaced by
the imported version. A **Super Admin** can archive such an entry: open it, choose
**Archive** in the publish panel, and say why.

An archived entry:

- is left out of every total, list, export and LBP form, on the staff side and
  on the public site;
- keeps its versions, edit history and comments, under the registry's
  **Archived** tab;
- can no longer be edited, commented on or deleted;
- still opens from its public link, marked *Archived* with your reason. Earlier
  public feedback stays visible, and new feedback is closed.

**Unarchive** (Super Admin, with a reason) puts it back in **Drafts**. It counts
again only once it is published.

---

## Exporting

**Export** offers two modes:

| | |
|---|---|
| **1** | **Export by Cluster** — one cluster's workbook |
| **2** | **Export Complete** — the whole AIP |

The `.xlsx` file is named `aip-<FY>-<cluster>-export.xlsx` and contains:

| Sheet | Contents |
|---|---|
| **Export Info** | Fiscal year, cluster, and export metadata |
| **GOALS** | The cluster's goals sheet |
| **`<OFFICE>` - Basic AIP Form** | One per office in the cluster |
| **`<OFFICE>` - Extended AIP Form** | One per office, with the fuller column set |

Exporting requires `aip:export`. It is read-only — it changes nothing.

### LBP Forms 4 and 7

The same menu also offers the two budget-preparation forms for the technical
budget hearings. Both open a short window before downloading:

| Choice | What it does |
|---|---|
| **Office** (Form 4 only) | One office, or every office you can export — one sheet each |
| **Fund** | Which fund the form is for. General Fund is chosen for you |
| **Figures** | **Working figures** — everything as it stands now, drafts included; the form is marked **DRAFT**. **Published figures only** — what the public sees; entries never published are left out |

- **LBP Form 4** (Mandate, Vision/Mission, Major Final Output, Performance
  Indicators and Targets) lists each office's programs, projects and activities
  under GAS, STO and Operations with PS, MOOE, FE, CO and Total.
- **LBP Form 7** (Statement of Fund Allocation by Sector) is the whole city, so
  only staff who can see every office get it. Each office's money goes in the
  column set on the office (see [Configuring Offices](configuring-offices.md));
  the special funds print as lump sums below the total.

Every workbook opens on a **Notes** sheet. Read it first: it lists the entries
that need attention — no fund source (counted as General Fund), several funds
not split (left out of the form), not yet published, offices without a Form 7
column. Fixing those in the portal and exporting again gives a clean form.

The sheets are locked against accidental edits. You can still select and copy
any cell. Signature lines carry the titles and are left blank for the names.

---

## Comments

Internal threads live on the **Comments** tab.

| | |
|---|---|
| **1** | Count of unresolved threads |
| **2** | **PUBLIC_FEEDBACK** — came from the public feedback form |
| **3** | **COMMENT** — an internal staff comment |
| **4** | **Resolve** — optionally with a public reply and/or an internal note |
| **5** | The composer for a new comment |

When you resolve a thread you can leave a **reply in the thread** (visible to
everyone, so the commenter sees what you did), an **internal note** (recorded but
not shown in the conversation), either, both, or neither.

Comments never block publishing — in this phase they arrive *after* publication.

---

## Public feedback

Residents send feedback from the public registry without signing in.

Per entry, on the **Public Feedback** tab:

| | |
|---|---|
| **2** | **Anonymous** — submitted without signing in |
| **3** | The published-state banner: figures are locked |
| **4** | **Edit this AIP** — opens a revision |

City-wide, under **Public Feedback** in the top navigation (`/dashboard/feedback`):

| | |
|---|---|
| **1** | **Program Feedback** — tied to a specific AIP entry |
| **2** | **General Feedback** — not tied to any entry |
| **3** | Review-state filters: **All · Unreviewed · Reviewed · Hidden** |
| **4** | **View** — open it to reply or mark it reviewed |

Columns: **Date & Time · Program / Activity / Project · Name & Email · Status ·
Message**. Seeing this page needs `public_comments:view`; replying needs
`public_comments:reply`; marking reviewed or hiding needs
`public_comments:moderate`.

---

## Editing after publishing

A published AIP is locked as a budget document. The drawer says so:

> **Live on the public registry.** The public is seeing version v2. Figures are
> locked. To change them, open a revision — the public keeps seeing the published
> version until you republish.

1. Click **Edit this AIP**. This opens a **revision**.
2. Make your changes — they save as you go.
3. Click **Publish changes**, or **Discard draft** to throw them away.

While a revision is open the entry shows an amber **"Draft changes not yet
published"** banner internally, and the public still sees the last published
version.

### Compare with published

**Compare with published** (or **Compare Versions**) shows the difference
side by side.

| | |
|---|---|
| **1** | **Comparing from** — which version |
| **2** | **Comparing to** — the live draft, or another version |
| **3** | Field-by-field difference |

Removed values appear struck through in red on the left; current values in green
on the right. Here the grand total went from ₱6,500,000.00 to ₱2,250,000.00, and
the single project was replaced by four.

---

## History

Two tabs that get confused. The portal spells out the difference at the top of
the History tab:

> **Versions** shows what this AIP looked like at each publish. **History** shows
> every action in between — who changed which figure, when, and for which office.

| | |
|---|---|
| **1** | Filter the event stream (**All actions**) |
| **2** | **append-only · N events** — nobody can edit or delete an entry |
| **3** | Money changes are logged as their own **Estimate updated** event |
| **4** | Old value → new value (`coEstimate 4000000 → 400000`) |

Each entry names the actor, their role, and the office they acted for
(*Super Admin User · super admin · for PSO*). Reading history needs `aip:audit`.
It is never shown publicly.

---

## What the public sees

| | |
|---|---|
| **1** | **Share feedback** — no sign-in needed |
| **2** | **Proposed** — the public money figure |
| **4** | The accountable **office**, never an individual's name |

The public registry (`/budget`, the Annual Budget Registry) shows the published
version of every published entry — never a draft. It carries a budget summary
(total proposed, active PPAs, average PPA size, offices submitted), the same
finish-line and cluster filters, and a feedback form that opens as soon as an
entry is published.

It is laid out the way the printed budget reads: **grouped by office**, and
inside each office the three appropriation sections (GAS, STO, Operations) plus
a COMPONENT PROGRAMS band for programs hosted from another office. Offices are
collapsed until opened, and opening one reveals its whole tree. There is no sort
control and no pagination — the whole cycle loads at once, because an office's
subtotal is only right when every one of its programs is on the page. The cycle
picker names each year for what it is: an enacted year reads **Annual Budget
2026**, a year still in preparation reads **AIP 2027**.

---

## Related

- [phase-1-encoding.md](phase-1-encoding.md) — the workflow in prose
- [public-registry.md](public-registry.md) — the citizen's view
- [staff-and-permissions.md](staff-and-permissions.md) — who can do each of these
- [glossary.md](glossary.md) — terminology
