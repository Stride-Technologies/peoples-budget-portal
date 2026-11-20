# Configuring Offices — Illustrated

Two different things in this portal are called an "office". Sort them out before
you change anything.

| | What it is | Where you configure it |
|---|---|---|
| **Office** | The unit that submits an AIP — CPDO, CAgO, CHO… Also what **office scope** grants access to. Carries the **office code** and **type** used in every AIP reference code. | Control Panel → **Offices** |
| **LFC office** | The four offices on the Local Finance Committee (CPDO, CBO, CTO, CMO) that approve. | Not configured — approval is paused |

> **There used to be a separate DBM Offices page.** The city reissued its AIP
> coding system as one flat list, so the office code and type moved onto the
> office itself. Everything is now on one page and there is no drag-to-renumber
> step — you type the code the sheet gives you.

---

## Offices

**Control Panel → Offices** (`/control-panel/offices`) is where every office is
managed. The table is grouped into **Mandatory**, **Optional** and **Others**
sections, matching the coding sheet.

Four columns are editable straight in the table — **code**, **type**,
**cluster** and **PAP sector**. Nothing is saved while you type: a bar appears
at the bottom showing how many offices you have changed, with **Discard** and
**Save changes**. Use **Add office** or a row's **Edit** for the full form
(acronym, full name, and whether the office records endorsements).

**PAP sector** is the sector an office usually submits under. It only
pre-selects the sector field when someone starts a new program — it is *not*
part of the AIP reference code, so changing it never renumbers anything. Eight
offices have no sector set; pick one if the office starts submitting.

### Office code and type

The **office code** and **office type** are two of the seven segments of every
AIP reference code beneath an office. Both are editable inline in the table, or
in the office's full form behind **Edit**.

- **Office code** is free text. Enter it exactly as the city's coding sheet has
  it, including a suffix like `11 (1)` where two offices share a base code.
- **Office type** is Mandatory, Optional or Others, and maps to the `1`/`2`/`3`
  digit in the AIP code.

Codes do **not** have to be unique. Several offices share one on purpose — the
sub-offices under the City Mayor's Office all carry `01`. Enter a code and type
already in use and the form names the office using it, then lets you save
anyway; both offices' submissions will carry the same AIP reference code.

Saving a changed code or type renumbers that office's affected submissions.
Approved submissions and closed cycles keep the codes they already have.

### LBP Form 7 column and special funds

Behind **Edit**, the **LBP Form 7** box decides where the office's money appears
on Form 7 (Statement of Fund Allocation by Sector):

- **Form 7 column** — General Public Services, Social Services, Economic
  Services or Economic Enterprises. The columns were filled in from the 2026
  appropriation ordinance; offices the ordinance did not name were set from their
  PAP sector, so check those. An office left blank is left out of Form 7's
  columns and listed on its Notes sheet.
Special funds — the Special Purpose Appropriation, the 20% Development Fund and
the 5% LDRRM Fund — are **not offices**. Each entry paid from one sits under the
office that runs it, with the fund as its fund source. Form 7 adds up every entry
charged to a special fund and prints it as a lump sum under the total. There is
nothing to tick on the office. The old LDF, SPAF and LDRRMF offices are inactive;
do not put entries under them.

Changing the column affects the next export only; files already downloaded stay
as they were. It does not change any AIP reference code.

## Clusters

**Control Panel → Clusters** (`/control-panel/clusters`) manages the strategic
clusters. Expanding a cluster **lists** its offices, but they are edited on the
Offices page — including which cluster an office belongs to.

| | |
|---|---|
| **1** | Clusters are grouped under the city's visions (**Vision 1** … **Vision 8**) |
| **2** | How many offices belong to this cluster |
| **3** | **Edit** — rename the cluster |

Each cluster card shows its short name (*Economy*), its full name (*Thriving
Economy*), and its office count. Expanding a cluster lists its offices by code
and name — `CAgO — City Agriculture Office`, and so on.

> **Moving an office between clusters does not change anyone's access.** Office
> scope stores individual offices, never "the cluster" — see
> [staff-and-permissions.md](staff-and-permissions.md#office-scope).

---

## The rest of the Control Panel

| Page | Route | Purpose |
|---|---|---|
| **AIP Cycles** | `/control-panel/aip-cycles` | Create the yearly cycle, move it through its stages, set finish-line ceilings |
| **Public Feedback** | `/dashboard/feedback` | Citizen feedback, program and general |
| **Users** | `/control-panel/users` | Invites, permissions, office scope |
| **Offices** | `/control-panel/offices` | Offices — code, type, cluster, PAP sector |
| **Clusters** | `/control-panel/clusters` | Strategic clusters (offices listed only) |
| **Finish Lines** | `/control-panel/finish-lines` | The strategic finish lines |
| **Civil Society Orgs** | `/control-panel/civil-society-organizations` | CSOs, and the endorser flag |
| **PAP Sectors** | `/control-panel/pap-sectors` | DBM BOM Annex 2 sector codes |
| **UACS Objects** | `/control-panel/uacs-objects` | UACS chart of accounts, by expense class |
| **Climate Codes** | `/control-panel/climate-typology-codes` | CCET climate typology codes |
| **SGLG Indicators** | `/control-panel/sglg-indicators` | DILG SGLG indicator framework |
| **SDG Goals** | `/control-panel/sdg-goals` | The 17 UN Sustainable Development Goals |

Reference records can be **deactivated** rather than deleted — inactive rows are
hidden from proponents but stay in the database so existing submissions still
display correctly. Use **Restore** to bring one back.

---

## Related

- [administrator.md](administrator.md) — the full Administrator guide
- [staff-and-permissions.md](staff-and-permissions.md) — office scope
- [aip-management.md](aip-management.md) — where these codes show up
- `api/docs/aip-reference.md` §7 — the AIP code format and its invariants
