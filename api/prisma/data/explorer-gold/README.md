# Data Explorer gold set (specs/020 B1.2)

Rows Stride has decided by hand: the evidence the labelling model is calibrated
and compared against (`db:label:calibrate`, the LAYA swap rule). Budget text
only, public record.

| File | Drawn | Rows | Status |
|---|---|--:|---|
| `gold-v1.csv` | 2026-11-13 from dev (12,279 labelled rows), seed `gold-v1` | 400, 64 offices | **awaiting review** |
| `gold-compounds-v1.csv` (+ `.cases.csv`) | 2026-11-13 from the same rows minus gold-v1's, seed `gold-compounds-v1`, `--compounds 5` | 207: 152 compound, 55 contrast, 39 phrases | **awaiting review** |

**Compound sheets** (specs/020, decision #16) are not a random draw. For each reviewed compound in
`../explorer-compounds.json` they hold up to 5 rows whose own name has the phrase ("Capacity Building of
Workforce") and, for a phrase kept out of a label, up to 5 contrast rows with the trigger word alone
("School Building"). Which case each row is sits in the `.cases.csv` sidecar, not on the sheet, so decide
from `text` as for any gold row. `db:label:calibrate` fits on `gold-v<n>.csv` only and reports the
compound sheets as a separate slice (their error rate is not the run's). Rows already on a random sheet
are left out of a compound draw, so no row is decided twice.

```bash
pnpm --filter api db:label:review -- export prisma/data/explorer-gold/gold-compounds-v1.csv --compounds 5
```

How a sheet is made and used:

```bash
pnpm --filter api db:label:review -- export prisma/data/explorer-gold/gold-v1.csv --gold 400   # stratified by office
# Stride fills `decision`: label ids (space-separated), or `none`. Leave blank to skip a row.
pnpm --filter api db:label:review -- apply prisma/data/explorer-gold/gold-v1.csv --dry-run      # then without --dry-run
pnpm --filter api db:label:calibrate -- --target 0.1                                            # → ../explorer-calibration.json
```

A gold sheet leaves `proposed` blank (the `picks` column keeps the model's answer for calibration): reading the model's
answer before deciding biases the gold set towards it, so decide from `text` alone. Commit the filled sheet;
a new draw gets a new seed and file name (`gold-v2`, …), never an edit of an
old one, so every published figure can be recomputed from the files it used.
