# A city's folder

What `pnpm --filter api db:seed:city` loads. This one is **Sample City**: a made-up city for trying
the portal. Copy the folder, replace the files with your LGU's, and load it with
`pnpm --filter api db:seed:city -- --dir /path/to/your-folder`.

| File | Holds | Needed |
|---|---|---|
| `manifest.json` | `name` (shown by the loader only) and `aipYear`, the fiscal year of the AIP file | Yes |
| `offices.json` | One entry per office: `code`, `acronym`, `name`, `officeType` (`MANDATORY`, `OPTIONAL`, `OTHERS`), `cluster`, `papSector` (a code in `../pap-sectors.json`), optional `form7Column` | Yes |
| `clusters.json` | Groups of offices: `name`, `fullName`, and `visions`, the numbers of the goals the cluster works on | Yes |
| `goals.json` | The LGU's top-level goals, numbered 1 to 8: `visionNumber`, `name`, `fullName`, `shortName`, `color` | Yes |
| `sub-goals.json` | Outcomes under a goal: `finishLineVisionNumber`, `code`, `name` | No |
| `aip-<year>.json` | The Annual Investment Program: one entry per program, with its projects and activities. The fields are `ProgramSeed` in `../../seed-aip.ts` | Yes |
| `csos.json` | Civil society organizations that have accounts: `code`, `name`, `clusterName` | No |
| `office-aliases.json` | `{ "OLD": "NEW" }` for offices renamed since the last seed, so the row is renamed and not duplicated | No |
| `office-lineage.json` | Offices that continue an earlier office across years, for charts over time | No |

The database and the API call a goal a *finish line* and number it with `visionNumber`. What the
site calls it is a setting (`NEXT_PUBLIC_GOAL_NAME`).

The four offices of the Local Finance Committee are looked up by acronym: `CPDO`, `CBO`, `CTO`, `CMO`.

## About the sample

21 standard city offices, eight goals, and the Annual Investment Program of six of those offices:
health, social welfare, agriculture, disaster risk reduction, environment, and planning (61 programs,
about ₱718 million). The programs and amounts are a real city's; every program that names a place was
left out, and `pnpm --filter api db:check:sample-city` proves no file here names one. Three of the 61
are held back as drafts by the publish check, on purpose: they show what an incomplete program looks
like to staff.
