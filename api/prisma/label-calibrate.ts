/**
 * Isotonic calibration of the labelling model's confidence on the gold set
 * (specs/020 B1.3; Guo et al. 2017).
 *
 *   pnpm --filter api db:label:calibrate [-- --target 0.1] [--dry-run]
 *
 * Fits on every filled random gold sheet, `prisma/data/explorer-gold/gold-v<n>.csv`
 * (drawn with `db:label:review -- export --gold 400`, decided by Stride). The
 * compound sheets (`gold-compounds-v<n>.csv` + `.cases.csv`, decision #16) are
 * chosen rows, not a random draw, so they are reported as a slice beside the
 * fit and never fitted on. It scores each
 * model pick as right or wrong, fits a non-decreasing curve and sets the
 * review threshold: the lowest stated confidence whose calibrated precision
 * is at least 1 − target. Writes `prisma/data/explorer-calibration.json`,
 * which `db:label` then uses in place of the fixed REVIEW_BELOW, and whose
 * curve the labels report prints. No database: the sheets are the evidence.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bootstrap,
  calibrated,
  crossFitted,
  ece,
  fitIsotonic,
  readGold,
  reviewThreshold,
  scorePicks,
  type GoldRow,
} from '../src/explorer/labels/calibration';
import { compoundSlice, readCases } from '../src/explorer/labels/compound-gold';
import { parseCsv, REVIEW_BELOW } from '../src/explorer/labels/labelling';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const TARGET = Number(arg('target') ?? 0.1);
const DRY_RUN = process.argv.includes('--dry-run');
const DIR = arg('dir') ?? join(__dirname, 'data', 'explorer-gold');
const OUT = join(__dirname, 'data', 'explorer-calibration.json');

/** Share of live picks that are wrong, at a threshold, over gold rows. */
const liveError = (rows: GoldRow[], below: number) => {
  const live = scorePicks(rows).filter((p) => p.confidence >= below);
  return live.length ? live.filter((p) => !p.correct).length / live.length : 0;
};
const liveShare = (rows: GoldRow[], below: number) => {
  const all = scorePicks(rows);
  return all.length
    ? all.filter((p) => p.confidence >= below).length / all.length
    : 0;
};

function main() {
  const all = existsSync(DIR) ? readdirSync(DIR) : [];
  const files = all.filter((f) => /^gold-v\d+\.csv$/.test(f));
  const compoundFiles = all.filter((f) => /^gold-compounds-v\d+\.csv$/.test(f));
  const rows = [
    ...new Map(
      files
        .flatMap((f) => readGold(readFileSync(join(DIR, f), 'utf8'), parseCsv))
        .map((r) => [r.rowId, r]),
    ).values(),
  ];
  const picks = scorePicks(rows);
  if (picks.length < 50)
    throw new Error(
      `Only ${picks.length} scored picks in ${DIR} (${rows.length} decided rows); need ≥ 50. Draw and review a gold set first.`,
    );
  const curve = fitIsotonic(picks);
  const threshold = reviewThreshold(curve, TARGET);
  // Intervals resample rows, not picks: picks on one row are not independent.
  const eceRaw = bootstrap(rows, (s) => ece(scorePicks(s)));
  const eceCal = bootstrap(rows, (s) =>
    ece(scorePicks(s), (c) => calibrated(curve, c)),
  );
  // Out of fold: the figure to report (in-sample isotonic ECE is optimistic).
  const oof = crossFitted(rows);
  const oofEce = bootstrap(oof, (s) =>
    ece(s.map((x) => ({ confidence: x.p, correct: x.correct }))),
  );
  const errFixed = bootstrap(rows, (s) => liveError(s, REVIEW_BELOW));
  const errCal = bootstrap(rows, (s) => liveError(s, threshold));
  const out = {
    fittedAt: new Date().toISOString().slice(0, 10),
    method: 'isotonic (PAV) on gold-set picks',
    target: TARGET,
    threshold,
    goldRows: rows.length,
    picks: picks.length,
    files,
    curve,
    ece: { raw: eceRaw, calibrated: eceCal, crossValidated5: oofEce },
    liveError: {
      fixed: { reviewBelow: REVIEW_BELOW, ...errFixed },
      calibrated: { reviewBelow: threshold, ...errCal },
    },
    liveShare: {
      fixed: liveShare(rows, REVIEW_BELOW),
      calibrated: liveShare(rows, threshold),
    },
  };
  const compoundRows = compoundFiles.flatMap((f) =>
    readGold(readFileSync(join(DIR, f), 'utf8'), parseCsv),
  );
  const compoundCases = compoundFiles.flatMap((f) => {
    const side = join(DIR, f.replace(/\.csv$/, '.cases.csv'));
    return existsSync(side) ? readCases(readFileSync(side, 'utf8')) : [];
  });
  const compounds = compoundRows.length
    ? { files: compoundFiles, decidedRows: compoundRows.length, ...compoundSlice(compoundRows, compoundCases, threshold) }
    : null;
  Object.assign(out, { compounds });
  const ci = (x: { value: number; lo: number; hi: number }) =>
    `${x.value.toFixed(3)} [${x.lo.toFixed(3)}, ${x.hi.toFixed(3)}]`;
  console.log(
    [
      `Gold rows ${rows.length}, picks ${picks.length} (${files.join(', ')}).`,
      `ECE raw ${ci(eceRaw)} → calibrated ${ci(eceCal)} in-sample, ${ci(oofEce)} 5-fold out-of-fold.`,
      `Live-label error at REVIEW_BELOW ${REVIEW_BELOW}: ${ci(errFixed)}; at calibrated ${threshold} (target ${TARGET}): ${ci(errCal)}.`,
      compounds
        ? `Compound slice (${compounds.decidedRows} decided rows, not fitted on): live error ${compounds.compound.liveError.toFixed(3)} on compound rows, ${compounds.contrast.liveError.toFixed(3)} on contrasts; kept-out label went live on ${compounds.compound.keptOutWrong}/${compounds.compound.keptOutRows} compound rows.`
        : `Compound slice: no decided rows in ${compoundFiles.join(', ') || '(no compound sheet)'}.`,
    ].join('\n'),
  );
  if (DRY_RUN) return;
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT}.`);
}

main();
