// ─── Default goal colours ──────────────────────────────────────────────────────
// An LGU's goals ("finish lines" in the database and the API) carry their own name and colour
// (`FinishLine.shortName` / `FinishLine.color`). These eight are what a goal numbered N falls back
// to while it has no colour of its own, and the colours of the site's top rule before any goal is
// loaded. The Tailwind theme palette further down is in the same order (FINISH_LINE_THEME_PALETTE).

export interface Vision {
  /** The goal's number, 1 to 8. */
  id: number;
  num: string;
  color: string;
}

export const VISIONS: Vision[] = ['#E5243B', '#4C9F38', '#FFB300', '#26BDE2', '#A21942', '#FD6925', '#DD1367', '#00689D'].map(
  (color, i) => ({ id: i + 1, num: `G${i + 1}`, color }),
);

export type FinishLineStatus = 'Active' | 'Planned' | 'Ongoing';

export type FinishLine = {
  id: string;
  name: string;
  shortName: string;
  cluster: string;
  category: string;
  code?: string;
  displayNumber?: number;
  status?: FinishLineStatus;
  allocation?: number;
  ceiling?: number;
  ppaCount?: number;
  programCount?: number;
  projectCount?: number;
  activityCount?: number;
  departmentCount?: number;
  responsibleOffice?: string;
  fiscalYear?: string;
  departments?: string[];
  description?: string;
};

export type FinishLineTheme = {
  header: string;
  code: string;
  status: string;
  label: string;
  title: string;
  category: string;
  number: string;
  numberShadow: string;
  bar: string;
  dot: string;
  chip: string;
};

// Tailwind theme palette, in the order of VISIONS: red, green, amber, cyan, rose, orange, pink, sky.
// Class strings are written out in full so Tailwind's scanner picks them up.
const FINISH_LINE_THEME_PALETTE: FinishLineTheme[] = [
  {
    header: 'border-red-200 bg-red-50',
    code: 'bg-red-100 text-red-900 ring-red-200',
    status: 'border-red-200 bg-white/70 text-red-900',
    label: 'text-red-700',
    title: 'text-red-950',
    category: 'text-red-800/75',
    number: 'text-red-700',
    numberShadow: 'text-red-100',
    bar: 'bg-red-600',
    dot: 'bg-red-600',
    chip: 'border-red-400 bg-red-100 text-red-800',
  },
  {
    header: 'border-green-200 bg-green-50',
    code: 'bg-green-100 text-green-900 ring-green-200',
    status: 'border-green-200 bg-white/70 text-green-900',
    label: 'text-green-700',
    title: 'text-green-950',
    category: 'text-green-800/75',
    number: 'text-green-700',
    numberShadow: 'text-green-100',
    bar: 'bg-green-600',
    dot: 'bg-green-600',
    chip: 'border-green-400 bg-green-100 text-green-800',
  },
  {
    header: 'border-amber-200 bg-amber-50',
    code: 'bg-amber-100 text-amber-900 ring-amber-200',
    status: 'border-amber-200 bg-white/70 text-amber-900',
    label: 'text-amber-700',
    title: 'text-amber-950',
    category: 'text-amber-800/75',
    number: 'text-amber-700',
    numberShadow: 'text-amber-100',
    bar: 'bg-amber-600',
    dot: 'bg-amber-600',
    chip: 'border-amber-400 bg-amber-100 text-amber-800',
  },
  {
    header: 'border-cyan-200 bg-cyan-50',
    code: 'bg-cyan-100 text-cyan-900 ring-cyan-200',
    status: 'border-cyan-200 bg-white/70 text-cyan-900',
    label: 'text-cyan-700',
    title: 'text-cyan-950',
    category: 'text-cyan-800/75',
    number: 'text-cyan-700',
    numberShadow: 'text-cyan-100',
    bar: 'bg-cyan-600',
    dot: 'bg-cyan-600',
    chip: 'border-cyan-400 bg-cyan-100 text-cyan-800',
  },
  {
    header: 'border-rose-200 bg-rose-50',
    code: 'bg-rose-100 text-rose-900 ring-rose-200',
    status: 'border-rose-200 bg-white/70 text-rose-900',
    label: 'text-rose-700',
    title: 'text-rose-950',
    category: 'text-rose-800/75',
    number: 'text-rose-700',
    numberShadow: 'text-rose-100',
    bar: 'bg-rose-600',
    dot: 'bg-rose-600',
    chip: 'border-rose-400 bg-rose-100 text-rose-800',
  },
  {
    header: 'border-orange-200 bg-orange-50',
    code: 'bg-orange-100 text-orange-900 ring-orange-200',
    status: 'border-orange-200 bg-white/70 text-orange-900',
    label: 'text-orange-700',
    title: 'text-orange-950',
    category: 'text-orange-800/75',
    number: 'text-orange-700',
    numberShadow: 'text-orange-100',
    bar: 'bg-orange-600',
    dot: 'bg-orange-600',
    chip: 'border-orange-400 bg-orange-100 text-orange-800',
  },
  {
    header: 'border-pink-200 bg-pink-50',
    code: 'bg-pink-100 text-pink-900 ring-pink-200',
    status: 'border-pink-200 bg-white/70 text-pink-900',
    label: 'text-pink-700',
    title: 'text-pink-950',
    category: 'text-pink-800/75',
    number: 'text-pink-700',
    numberShadow: 'text-pink-100',
    bar: 'bg-pink-600',
    dot: 'bg-pink-600',
    chip: 'border-pink-400 bg-pink-100 text-pink-800',
  },
  {
    header: 'border-sky-200 bg-sky-50',
    code: 'bg-sky-100 text-sky-900 ring-sky-200',
    status: 'border-sky-200 bg-white/70 text-sky-900',
    label: 'text-sky-700',
    title: 'text-sky-950',
    category: 'text-sky-800/75',
    number: 'text-sky-700',
    numberShadow: 'text-sky-100',
    bar: 'bg-sky-600',
    dot: 'bg-sky-600',
    chip: 'border-sky-400 bg-sky-100 text-sky-800',
  },
];

export function getFinishLineTheme(
  displayNumber?: number | null,
  totalFinishLines?: number | null,
): FinishLineTheme {
  const normalizedNumber =
    typeof displayNumber === 'number' && Number.isFinite(displayNumber) && displayNumber > 0
      ? displayNumber
      : 1;
  const normalizedTotal =
    typeof totalFinishLines === 'number' && Number.isFinite(totalFinishLines) && totalFinishLines > 1
      ? Math.trunc(totalFinishLines)
      : null;
  const index =
    normalizedTotal && normalizedTotal <= FINISH_LINE_THEME_PALETTE.length
      ? Math.round(
          ((Math.trunc(normalizedNumber) - 1) / (normalizedTotal - 1)) *
            (FINISH_LINE_THEME_PALETTE.length - 1),
        ) % FINISH_LINE_THEME_PALETTE.length
      : (Math.trunc(normalizedNumber) - 1) % FINISH_LINE_THEME_PALETTE.length;

  return FINISH_LINE_THEME_PALETTE[index] ?? FINISH_LINE_THEME_PALETTE[0]!;
}

export function getFinishLineLabel(id?: string): string {
  return id?.trim() || '-';
}

// ─── Readable foreground on a finish-line colour ─────────────────────────────

/** Relative luminance per WCAG 2.x, from an `#rrggbb` string. */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const INK = '#151414';

/**
 * The foreground to put on a finish-line colour — whichever of ink or white has
 * the better contrast against it.
 *
 * This exists because eyeballing it is wrong. White on the eight SDG hexes fails
 * WCAG AA on **four** of them: amber `#FFB300` is 1.79:1, cyan `#26BDE2` 2.22:1,
 * orange `#FD6925` 2.91:1 and green `#4C9F38` 3.32:1. Picking per colour, every
 * one clears 4.5:1 — the worst becomes FL1 at 4.52:1.
 *
 * Use it anywhere a finish-line colour becomes a *background*: the vision cards'
 * colour panels and their buttons. It is not needed where the colour is only a
 * fill beside text (a bar, a dot), which carries no text of its own.
 */
export function readableOn(background: string): string {
  return contrast(INK, background) > contrast('#FFFFFF', background)
    ? INK
    : '#FFFFFF';
}
