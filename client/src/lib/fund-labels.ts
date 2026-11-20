import { FUND_SOURCES, PAP_CLASSES } from './schemas.ts';

/** "General Fund (GF)" — the code alone means nothing to most visitors. */
export function fundName(code: string): string {
  const f = FUND_SOURCES.find((x) => x.value === code);
  if (!f) return code;
  return f.description === f.label ? f.label : `${f.description} (${f.label})`;
}

/**
 * Every fund a program draws on: its own `fundSources` and every PPA's — a
 * program that rolls up states none of its own (schema: `Program.fundSources`).
 * In `FUND_SOURCES` order, so the list reads the same everywhere.
 */
export function programFunds(program: {
  fundSources?: readonly string[] | null;
  projectActivities?: readonly { fundSources?: readonly string[] | null }[] | null;
}): string[] {
  const all = new Set([
    ...(program.fundSources ?? []),
    ...(program.projectActivities ?? []).flatMap((p) => p.fundSources ?? []),
  ]);
  const order = FUND_SOURCES.map((f) => f.value as string);
  return [...all].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

export function papClassName(value: string | null | undefined): string | null {
  return PAP_CLASSES.find((c) => c.value === value)?.label ?? null;
}
