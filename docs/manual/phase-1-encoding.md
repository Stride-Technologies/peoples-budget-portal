# Encoding and Publishing an AIP (Phase 1)

This is the guide for **how the portal works right now**. It replaces the
submit-and-approve flow described in the other role guides, which is retired
while the review process is redesigned.

> Prefer to see the screens? [aip-management.md](aip-management.md) walks the
> same flow with screenshots of every step.

The short version: a small CPDO team enters every office's AIP on its behalf,
with proposed cost estimates, and publishes it. Once published, the entry is on
the public registry, offices and reviewers comment on it, and encoders can revise
and republish as often as needed.

---

## Who does what

| You are | You can |
|---|---|
| **CPDO Head** | Everything below, including **publishing** |
| **CPDO Secretariat / encoder** | Everything except publishing — you prepare and save; a Head publishes |
| **Intern / authorized encoder** | Enter and edit PPAs for the offices assigned to you |
| **CMO / CBO reviewer** | Read every AIP, comment, view the edit history |
| **Office Head / representative** | Read your own office's AIP, comment on it |
| **NCPC** | Read and comment (advisory) |

Two separate things decide what you can do:

1. **Permissions** — the actions you're allowed to take (`aip:write`,
   `aip:publish`, …).
2. **Office scope** — whose AIP records you're allowed to touch.

Both must allow an action. An encoder with `aip:write` but no scope on the City
Agriculture Office cannot edit that office's entries. Ask an administrator to
adjust either.

---

## Entering an AIP

1. **AIP Registry → + New AIP entry.** Choose the implementing office. You'll
   only see offices in your scope.
2. **Pick the classification** — this is the first field, above the program
   name. It decides which section of the AIP form the program is printed under:

   | Classification | Prints under |
   |---|---|
   | **General Administrative Services** | I. General Administration and Support |
   | **Support to Operations** | II. Support to Operations |
   | **Operations** | III. Operations |

   Programs entered before this field existed have no classification and print
   under Operations. Open the program and set it to move it.
3. Fill in the rest of the program details — name, finish line, PAP sector,
   implementation period.
4. **Add each Project or Activity.** For every PPA:

   - **Source of Funds** — tick every fund the PPA draws on (GF, SEF, LDF,
     LDRRMF, SPA, PPP, NGA, Donations/Grants, GAD, Trust Fund). You can pick
     more than one. You don't split the amount between them — just say which
     funds are involved.
   - **The amounts**, against one or more expense classes:

     | Class | Covers |
     |---|---|
     | **PS** | Personnel Services |
     | **MOOE** | Maintenance and Other Operating Expenses |
     | **FE** | Financial Expenses — bank charges, interest and other financial charges |
     | **CO** | Capital Outlay |

   The **Proposed Budget** is calculated from those four — you don't type it.
   At least one class must be non-zero.

   **A project set to Activity-Derived Costs asks for neither.** It has no
   figures and no funds of its own: its PS / MOOE / FE / CO are added up from its
   activities, and its source of funds is every fund those activities draw on.
   Enter both on the activities, and the project fills itself in.

> **Cost assumptions (quantity × unit cost against UACS objects) are not part of
> this phase.** You'll see a placeholder where they'll go. Entries created
> earlier that already have line items keep them; they're just not edited here
> yet.

Everything stays a **draft** until someone publishes it. Nothing you type is
public before then.

---

## Publishing

Publishing is what makes an entry public and assigns its **final AIP reference
code** — which never changes afterwards.

Before the button enables, an entry needs:

- at least one Project or Activity, and
- a proposed budget above zero on every one of them.

You'll also see, as information rather than obstacles:

- **unresolved comment threads** — these never block publishing, because in this
  phase comments arrive *after* publication;
- a **budget ceiling warning**, if the finish line has a ceiling configured and
  publishing would exceed it. Advisory only;
- **notes about missing details** — how many PPAs (or, for an entry that
  states its own costs, the entry itself) still have no amount, no funding
  source, no expected output or no dates. These are worked out fresh every time
  you open the entry, so each one disappears as soon as you fill the field in.
  There is nothing to tick off. A missing amount or date blocks publishing; a
  missing funding source or expected output does not, and reads "Not yet
  stated" to the public.

### Entries brought in from the AIP workbook

An entry imported from the city's 2027 workbook may show an orange panel headed
**"The AIP workbook import had to make these calls"**. This is not about missing
data. It means the import had to decide something the spreadsheet didn't say —
usually which finish line the entry belongs to, worked out from the implementing
office. Occasionally it's that the workbook listed the same program twice and the
two were combined, or that some PPAs had no program heading and one was created
to hold them (that one needs a proper name).

The portal cannot check these for you. Once the finish line was saved, it looks
exactly like one someone chose deliberately — so somebody has to confirm it.

1. Read the notes and check the entry against them.
2. Fix anything wrong by editing the entry as normal.
3. Click **Mark import reviewed**.

That clears the panel and lets the entry publish. It's recorded in **History**,
along with the notes it cleared, but there's no undo — so read them before
clicking. You need `aip:publish` to do this; otherwise the button is disabled and
you should ask a CPDO Head.

In *Publish cluster* and the registry list, an entry awaiting this shows an amber
warning triangle. Hover it to see the notes without opening the entry.

**Publishing a whole cluster:** *Publish cluster* in the header. You'll get a
readiness list first, showing exactly which entries are ready and why the others
aren't. Blocked entries are skipped, not failed — the ready ones still go out.

If you don't hold `aip:publish`, the button is visible but disabled, with the
reason shown. Prepare the entry and ask a CPDO Head.

---

## Changing something after publishing

A published AIP is locked as a budget document. To change it:

1. Open it and click **Edit this AIP**. This opens a *revision*.
2. Make your changes. They save as you go.
3. Click **Publish changes** when ready — or **Discard draft** to throw them away
   and go back to the published version.

**While a revision is open, the public still sees the last published version.**
Nothing you type reaches the registry until someone republishes. The entry shows
an amber "Draft changes not yet published" banner internally so it doesn't sit
forgotten, and **Compare with published** shows exactly what's different.

Each publish is a new version, kept permanently.

---

## Comments

Comments work on published entries — that's the point. A reviewer flags a
concern, an encoder fixes the PPA and republishes.

When you resolve a thread you can leave:

- a **reply in the thread** — visible to everyone, so the commenter sees what you
  actually did; and/or
- an **internal note** — recorded but not shown in the conversation.

Either, both, or neither.

---

## History

Two different tabs, often confused:

| | Answers |
|---|---|
| **Versions** | "What did this AIP look like at v3?" |
| **History** | "Who changed what, when, and for which office?" |

**History** is the one that shows a figure was changed from ₱180,000 to ₱450,000,
by whom, and which office they were acting for. It's append-only — nobody can
edit or delete an entry, including administrators. It is never shown publicly.

---

## What the public sees

- The published version of every published entry — never a draft.
- Proposed budget figures, PPA details, and the version list.
- **Dates and the accountable office**, never an individual person's name.
- A feedback form, open as soon as an entry is published.

---

## Related

- [aip-management.md](aip-management.md) — the same flow, with screenshots
- [staff-and-permissions.md](staff-and-permissions.md) — permissions and office scope, with screenshots
- [public-registry.md](public-registry.md) — the public-facing side
- [glossary.md](glossary.md) — terminology
- `docs/design/phase-1-publish-scope.md` — why the phase is scoped this way
