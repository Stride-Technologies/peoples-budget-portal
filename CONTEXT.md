# People's Budget Portal: vocabulary

How one fiscal year's public money moves from a plan to an enacted budget in a Philippine LGU, in the terms
of the DBM *Budget Operations Manual for LGUs, 2023*. The portal holds the documents of that journey
and shows them to residents.

## Language

### The cycle

**Budget Cycle**:
Everything that happens to one fiscal year's budget, from consultations through the enacted
ordinance and its execution. It runs for about two calendar years, so two cycles are always live at once.
_Avoid_: AIP cycle (that is only one stage of it), budget year

**Stage**:
Where a Budget Cycle currently stands, one of ten steps from Consultations to Accountability. Staff set it.
It is not derived from which documents exist.
_Avoid_: phase (contract phases P1–P4 are a different thing), status

**Fiscal Year**:
The calendar year a Budget Cycle's money is for. FY2027's cycle is mostly prepared during 2026.

### Documents

**AIP** (Annual Investment Program):
The city's prioritized list of PPAs for a fiscal year, with what each would cost. It is a plan, not
an authority to spend.
_Avoid_: budget, annual budget

**Adopted AIP**:
The AIP once CPDO marks it final for its cycle, recording the LDC or Sanggunian resolution when there
is one. From then on it is the basis for the budget documents that follow.
_Avoid_: locked AIP, approved AIP

**LBP Forms** (Local Budget Preparation forms):
The prescribed worksheets offices fill in to propose their budget: Form 2 by object of expenditure,
Form 4 by PPA, Form 7 by sector, and others. In the portal they are generated from the Adopted AIP and the
approved PPMPs.
_Avoid_: LEP (the LEP is consolidated from them), budget proposal forms

**LEP** (Local Expenditure Program):
The consolidated budget the Mayor proposes to the Sanggunian, due by 16 October. It is the same
document as the **Executive Budget**.
_Avoid_: executive budget (say LEP), proposed budget

**Ordinance**:
The appropriation ordinance: the LEP as passed by the Sanggunian and approved by the Mayor. It is the
city's legal authority to spend. Residents see it as the **Annual Budget**.
_Avoid_: AB (except in file names), approved city budget, enacted AIP

**Enacted**:
An Ordinance is enacted once the Mayor approves it: by signing it, or by letting the 10 days for
action lapse. A passed but unsigned Ordinance is not yet enacted. A later DBM review does not undo
enactment.
_Avoid_: passed (that is only the Sanggunian's vote), approved, final

**Budget Document**:
The general name for an LEP or an Ordinance. Each has the same two tables: by PPA and by object of expenditure.

**MVMMFOPIT**:
The by-PPA table of a Budget Document, one per office: Mandate, Vision/Mission, Major Final Output,
Performance Indicators and Targets, with each PPA's money. It has the shape of LBP Form 4.
_Avoid_: by-PPA sheet, Form 4 (when you mean the enacted table)

**PAOO**:
The by-object table of a Budget Document, one per office: Programmed Appropriation and Obligation by
Object of Expenditure. It has the shape of LBP Form 2.
_Avoid_: LBP 2 sheet

### Money

**PPA** (Program / Project / Activity):
A fundable item. A PPA in the AIP and the same PPA in the LEP and the Ordinance are linked, mainly
by AIP Reference Code.
_Avoid_: line item (a line item is one costed object inside a PPA), entry

**Own Amount**:
The money a PPA's row states for itself, excluding its children. A heading in the city's books can carry its own amount.

**Total**:
A PPA's Own Amount plus the totals of all its children. A Budget Document's total is the sum of its top-level PPAs' totals.
_Avoid_: rollup, grand total (for a single PPA)

**Expense Class**:
PS, MOOE, FE, CO, always in that order.

### Procurement

**PPMP** (Project Procurement Management Plan):
An office's list of what it will buy to carry out its PPAs, line by line, each with its UACS account.
In the portal it is called a "Project".
_Avoid_: procurement plan (ambiguous with APP)

**Indicative PPMP**:
The PPMP an office drafts alongside its budget proposal, before the Ordinance exists.

**Final PPMP**:
The PPMP revised to match the enacted Ordinance, after enactment. It is what the APP is built from.

**APP** (Annual Procurement Plan):
The BAC's consolidation of every office's Final PPMP into the city's procurement plan for the year.
_Avoid_: PPMP summary

## Relationships

- A **Budget Cycle** has at most one **AIP**, at most one **LEP** and at most one **Ordinance**. A
  historical year may have only an Ordinance.
- **LBP Forms** are generated from the **Adopted AIP** and the approved **Indicative PPMPs**. Those same figures seed the **LEP**.
- The **Ordinance** is the **LEP** as amended at the Sanggunian hearings. Each changed PPA carries the reason for the change.
- A **Final PPMP** line points at a PPA in the **Ordinance**. An **Indicative PPMP** line points at a PPA in the **AIP**.
- An **APP** consolidates **Final PPMPs**.

## Example dialogue

> **Dev:** "The 2027 AIP was adopted, so should 2027 show under Annual Budget now?"
> **Budget officer:** "No. The AIP is still only the plan. 2027 becomes an Annual Budget when its
> Ordinance is enacted. Until then, the LEP is with the Sanggunian."

## Flagged ambiguities

- "Annual Budget" was used for both the enacted Ordinance and the cycle's position ("the cycle is
  LOCKED"). Resolved: it means the **Ordinance**, as residents see it.
- "Approved" was used for the AIP, the Ordinance and the PPMP. Resolved: the AIP is **Adopted**,
  the Ordinance is **Enacted**, and only a PPMP is **Approved**.
- "LBP Form 2" was used for both the offices' proposal worksheet and the PAOO table of the LEP and the
  Ordinance. Resolved: **LBP Form 2** is the proposal worksheet; **PAOO** is the table inside a Budget Document.
