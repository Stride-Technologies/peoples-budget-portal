/**
 * Colour presets for the site (`SITE_PALETTE`). The chosen one is written onto <html> as CSS
 * custom properties, overriding the brand tokens in globals.css.
 *
 * Presets rather than a free picker so contrast is guaranteed: palettes.test.ts measures
 * every pair. Values are Tailwind's hexes (700 for the brand colour, then 800/50/100/200/300).
 */
export interface Palette {
  id: string;
  label: string;
  /** Buttons, links, focus: white text sits on it. */
  primary: string;
  /** Darker shade for text on white and on `fill`. */
  ink: string;
  fill: string;
  fillStrong: string;
  rule: string;
  ruleStrong: string;
}

export const PALETTES: readonly Palette[] = [
  { id: 'civic-blue', label: 'Civic blue', primary: '#1D4ED8', ink: '#1E40AF', fill: '#EFF6FF', fillStrong: '#DBEAFE', rule: '#BFDBFE', ruleStrong: '#93C5FD' },
  { id: 'harbor-teal', label: 'Harbor teal', primary: '#0F766E', ink: '#115E59', fill: '#F0FDFA', fillStrong: '#CCFBF1', rule: '#99F6E4', ruleStrong: '#5EEAD4' },
  { id: 'forest', label: 'Forest', primary: '#15803D', ink: '#166534', fill: '#F0FDF4', fillStrong: '#DCFCE7', rule: '#BBF7D0', ruleStrong: '#86EFAC' },
  { id: 'maroon', label: 'Maroon', primary: '#9F1239', ink: '#881337', fill: '#FFF1F2', fillStrong: '#FFE4E6', rule: '#FECDD3', ruleStrong: '#FDA4AF' },
  { id: 'slate', label: 'Slate', primary: '#334155', ink: '#1E293B', fill: '#F8FAFC', fillStrong: '#F1F5F9', rule: '#E2E8F0', ruleStrong: '#CBD5E1' },
  { id: 'amber-ink', label: 'Amber', primary: '#B45309', ink: '#92400E', fill: '#FFFBEB', fillStrong: '#FEF3C7', rule: '#FDE68A', ruleStrong: '#FCD34D' },
];

export const DEFAULT_PALETTE = 'civic-blue';

export const paletteById = (id: string | null | undefined): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;

export const isPaletteId = (id: unknown): id is string => PALETTES.some((p) => p.id === id);

/** The palette as an inline `style` for <html>: the brand tokens of globals.css, overridden. */
export function paletteStyle(id: string): Record<string, string> {
  const p = paletteById(id);
  return {
    '--primary': p.primary,
    '--primary-foreground': '#FFFFFF',
    '--ring': p.primary,
    '--sidebar-primary': p.primary,
    '--sidebar-primary-foreground': '#FFFFFF',
    '--chart-4': p.primary,
    '--color-tbl-accent': p.primary,
    '--color-tbl-accent-ink': p.ink,
    '--color-tbl-accent-ink-2': p.ink,
    '--color-tbl-accent-fill': p.fill,
    '--color-tbl-accent-fill-strong': p.fillStrong,
    '--color-tbl-accent-rule-soft': p.fillStrong,
    '--color-tbl-accent-rule': p.rule,
    '--color-tbl-accent-rule-strong': p.ruleStrong,
  };
}
