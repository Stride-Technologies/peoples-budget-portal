# Inviting and Managing Staff — Illustrated

Screens for inviting people, granting permissions, and setting office scope.
For the concepts behind these screens, see
[administrator.md](administrator.md) §Grant permissions and office scope.

Everything below lives in **Control Panel → Users** (`/control-panel/users`).

---

## The user list

| | |
|---|---|
| **1** | **Invite user** — opens the invitation form |
| **2** | Columns: **Name · Email · Role · Identity · Status** |
| **3** | **Pencil** — edit role, office, and active/inactive |
| **4** | **Key** — permissions and office scope |

A pending invitation shows different actions (resend / revoke) instead of the
pencil — see [Pending invitations](#pending-invitations).

---

## Invite someone

Click **Invite user**.

| | |
|---|---|
| **1** | First name, last name, work email |
| **2** | **Identity type** — `LGU`, `LFC`, `NCPC`, or `Developer` |
| **3** | **City office** (LGU, LFC) or **NCPC organization** (NCPC) — appears once you pick an identity type. A Developer has neither |
| **4** | **Apply a template** — a starting set of permissions |
| **5** | The template applied here is *CPDO Secretariat* |

**Role** (`STAFF` / `HEAD` / `SUPER_ADMIN`) no longer decides what someone can
do. Permissions do. Role remains on the account for reporting and for the
Super Admin bypass.

Access is granted **at invite time** — the dialog says so:

> What they can do, and whose AIP records they can do it to. Both must allow an
> action. Applied when they accept the invitation — you can change it any time
> afterwards.

---

## Permissions

Tick the actions the person needs. Each key shows its own description, and each
group shows how many of its keys are granted (`4 of 6`).

| | |
|---|---|
| **1** | The **Aip Detail** and **Approvals** groups are reserved for future features |
| **2** | Keys badged **"not enforced yet"** — safe to grant, nothing checks them |

### Every key

Source of truth: `api/src/permissions/permission-catalog.ts`.

**AIP**

| Key | Description shown in the portal |
|---|---|
| `aip:read` | View programs, project/activities, versions, activity streams |
| `aip:write` | Create and edit programs and project/activities, including cost estimates |
| `aip:delete` | Soft-delete a program |
| `aip:publish` | Publish and republish; assigns the final AIP reference code on first publish |
| `aip:export` | Export the cluster workbook |
| `aip:audit` | View the edit history / event log for a program or PPA |

**Comments**

| Key | Description |
|---|---|
| `comments:read` | Read internal comment threads |
| `comments:write` | Post internal comments and replies |
| `comments:resolve` | Resolve and unresolve comment threads |
| `comments:moderate` | Soft-delete and restore any comment |

**Public feedback**

| Key | Description |
|---|---|
| `public_comments:view` | See public feedback and analytics in the portal |
| `public_comments:reply` | Post, edit, and delete the official public reply |
| `public_comments:moderate` | Mark reviewed/unreviewed, soft-delete, restore |

**Cycles**

| Key | Description |
|---|---|
| `cycles:read` | View a cycle's details and budget ceilings (listing the cycles needs only `aip:read`) |
| `cycles:write` | Create cycles and change cycle status |
| `ceilings:write` | Create, update, and delete finish-line budget ceilings |

**Reference data**

| Key | Description |
|---|---|
| `reference:read` | Read reference data including inactive rows |
| `reference:write` | Create and update reference data |

**Users**

| Key | Description |
|---|---|
| `users:read` | View users, invites, audit logs, and the permission catalog |
| `users:write` | Invite and edit users, grant permissions and office scope |

**Reserved — not enforced yet**

| Key | Description |
|---|---|
| `line_items:read` / `line_items:write` | Reserved — line-item cost assumptions (not enforced yet) |
| `approvals:decide` | Reserved — committee approval (paused) |
| `endorsements:record` | Reserved — advisory endorsement (paused) |

### Templates

Seven presets. Applying one **replaces** the whole current set; every checkbox
stays editable afterwards.

| Template | Includes |
|---|---|
| **CPDO Head** | All AIP keys including `aip:publish`, all comment and public-feedback keys, cycles, ceilings, `reference:read`, `users:read`, `users:write` |
| **CPDO Secretariat** | `aip:read/write/export/audit`, comments read/write/resolve, `public_comments:view`, `reference:read` |
| **Intern / Authorized Encoder** | `aip:read/write`, `comments:read/resolve`, `reference:read` |
| **CMO** | `aip:read/export/audit`, `comments:read/write`, `public_comments:view` |
| **CBO** | Same as CMO |
| **Office Head / Representative** | `aip:read`, comments read/write/resolve, `public_comments:view` |
| **NCPC** | `aip:read`, `comments:read/write` |

> **`aip:publish` appears in one template only — CPDO Head.** Publishing is what
> makes a figure public and locks in the AIP reference code. Encoders prepare
> and save everything without it.

---

## Office scope

Permissions answer *what*. Office scope answers *whose records*. **Both** must
allow an action.

| | |
|---|---|
| **1** | **All offices** — "Every city office's AIP records, current and future" |
| **2** | The running count (`5 of 57 selected`) |
| **3** | Ticking a **cluster header** selects that cluster's offices |

The portal states the rule under the list:

> Selecting a cluster grants its offices individually. If an office later moves
> to another cluster, this person's access is unchanged.

Only individual offices are stored, never "the cluster" — so a cluster
reorganisation never silently changes anyone's access.

---

## Pending invitations

An invited person appears immediately with status **Pending**.

| | |
|---|---|
| **1** | **Pending** — invited, not yet accepted |
| **2** | **Resend** the invitation email |
| **3** | **Revoke** — cancels the invitation and removes the row |
| **4** | **Dev mail outbox** — development only |

In development no email is actually sent; the invitation link is captured in the
**Dev mail outbox** so you can copy it. (The token is masked in this screenshot.)
In production the person receives the email and follows the link to
`/set-password` to choose a password and activate the account.

---

## Editing an existing account

Click the **pencil**.

| | |
|---|---|
| **1** | **Role** — Staff ⇄ Head |
| **2** | **Status** — active / inactive. Deactivating ends live sessions immediately |
| **3** | **City office** — reassignment is Administrators only |
| **4** | **Change history** |
| **5** | Permission grants are logged here too (`+2 permission(s)`) |

A deactivated user keeps their record but cannot sign in; reactivating restores
access.

**Someone coming back after being deactivated?** You have two ways in. Flip
**Status** back to active if they should return exactly as they were — same
password, same office, same permissions. Or send them a **fresh invitation** to
the same email address: they set a new password, and the role, office, and
access you pick on the invite replace what they had. Their old programs and
history stay attached to them either way. Only *active* accounts refuse a new
invitation with "Email already in use".

### Change history

Append-only. Each entry names the change, who made it, and when. Sign-ins,
role changes, office reassignments, and permission grants all appear.

---

## Changing permissions later

Click the **key** on any row. Same editor, without the invite fields.

| | |
|---|---|
| **1** | The dialog is titled **Permissions & office scope — <name>** |
| **2** | Per-group granted count |
| **3** | `aip:publish` — grant narrowly |

For a **Super Admin**, the save button is disabled with the note *"Super Admins
bypass these checks — nothing to save."*

---

## Guardrails

- You cannot deactivate or change the role of **your own** account.
- You cannot remove your own `users:write` — that would lock you out of this screen.
- Only Administrators can reassign someone to a different office or delete a user.
- Office Heads can invite and manage users **within their own office** only.

---

## Related

- [administrator.md](administrator.md) — the full Administrator guide
- [phase-1-encoding.md](phase-1-encoding.md) — how permissions play out day to day
- [aip-management.md](aip-management.md) — what the AIP permissions unlock
- [configuring-offices.md](configuring-offices.md) — the offices scope refers to
