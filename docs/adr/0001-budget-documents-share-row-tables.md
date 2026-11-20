# LEP and Ordinance share one set of row tables; the AIP keeps its own

The LEP and the Ordinance are stored as **Budget Documents** of different kinds, sharing one PPA table
and one object-of-expenditure table. Each kind also has its own header table: the LEP keeps its
submission date and Budget Message, the Ordinance its number and the dates it was passed and signed.
The BOM defines the Ordinance as "the LEP as enacted", so the rows have the same columns. What the
portal mostly does with these documents is compare one stage with the next and generate forms from
any of them, and separate tables would have turned every comparison into a UNION and doubled every
importer. The AIP stays on its own Program/ProjectActivity tables, because offices encode and
publish it program by program, and that workflow (versions, publish/revise) doesn't apply to a
document that is finalized all at once.

## Considered Options

- **A separate table per document kind.** Rejected because the rows are identical, so importers,
  comparisons and forms would be duplicated.
- **Moving the AIP into the same tables.** Rejected because it would rewrite encoding, publishing,
  AIP codes and the public site for no domain gain.

## Consequences

- A kind that truly diverges later (for example DBM review or supplemental budgets) gets its own table
  then. Until a real document needs them, kind-only columns are not added.
