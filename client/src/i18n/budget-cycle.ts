/**
 * The budget cycle's copy in the visitor's language (specs/014). The English is
 * `lib/budget-cycle.ts`; translations live in the catalogues under `cycle.*`.
 */
import {
  BUDGET_PHASES,
  BUDGET_STAGES,
  LANE_LABEL,
  LANE_PEOPLE,
} from '../lib/budget-cycle.ts';
import type { Locale } from './locales.ts';
import { collectSource, localize } from './localize.ts';

/** `vars`: the LGU's names for the copy's slots (`messageVars(brand)`). */
export function cycleCopy(locale: Locale, vars: Record<string, string>) {
  return {
    stages: localize(BUDGET_STAGES, locale, 'cycle.stage', undefined, vars),
    phases: localize(BUDGET_PHASES, locale, 'cycle.phase', undefined, vars),
    laneLabel: localize(LANE_LABEL, locale, 'cycle.lane', undefined, vars),
    lanePeople: localize(LANE_PEOPLE, locale, 'cycle.lanePeople', undefined, vars),
  };
}

/** Every cycle string, for `tools/translate`. */
export function cycleSource(): Record<string, string> {
  return {
    ...collectSource(BUDGET_STAGES, 'cycle.stage'),
    ...collectSource(BUDGET_PHASES, 'cycle.phase'),
    ...collectSource(LANE_LABEL, 'cycle.lane'),
    ...collectSource(LANE_PEOPLE, 'cycle.lanePeople'),
  };
}
