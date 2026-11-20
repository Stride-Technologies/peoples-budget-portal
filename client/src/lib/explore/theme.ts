/**
 * The workspace's one chart look (specs/020 A1): a blueprint base on the
 * portal's paper and ink. One ink on paper, a fine grid, thin rules, no 3D
 * (Pandey 2015). Colours come from the workspace's CSS tokens (`readTheme()` in
 * `vega-chart.tsx`), so light and dark are each the validated `--s1…--s8` set.
 *
 * `compile()` puts this on every Vega-Lite spec in place of per-spec styling.
 */
import type { Theme } from './compile.ts';

export const SCHEMA_VL = 'https://vega.github.io/schema/vega-lite/v6.json';
export const SCHEMA_VG = 'https://vega.github.io/schema/vega/v6.json';

/** Sequential (one hue, light → dark) and diverging (red ↔ grey ↔ blue) ramps, from the dataviz reference palette. */
export const SEQ = { light: ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'], dark: ['#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb'] };
export const DIV = { light: ['#b8282a', '#f0a3a2', '#f0efec', '#9ec5f4', '#1c5cab'], dark: ['#e66767', '#8a3030', '#383835', '#1c5cab', '#86b6ef'] };

/** Dark when the paper is dark: the ramps step from the surface, not to it. */
export const isDarkPaper = (paper: string) => /^#/.test(paper) && parseInt(paper.slice(1, 3), 16) < 0x80;

export function vegaConfig(theme: Theme) {
  const rule = { domain: true, domainColor: theme.muted, domainWidth: 0.75, ticks: false };
  return {
    font: theme.font,
    view: { stroke: null },
    axis: {
      labelColor: theme.muted,
      labelFont: theme.font,
      labelFontSize: 11,
      labelOverlap: true,
      titleColor: theme.muted,
      titleFont: theme.font,
      titleFontSize: 11,
      titleFontWeight: 500,
      gridColor: theme.grid,
      gridWidth: 0.5,
      tickCount: 5,
      domain: false,
      ticks: false,
    },
    // Categories: ink labels, no grid; the zero rule is the one thin line a bar stands on.
    axisDiscrete: { grid: false, labelColor: theme.ink, labelLimit: 220, labelPadding: 6 },
    axisQuantitative: { grid: true, gridDash: [2, 3] },
    axisLeft: rule,
    axisBottom: rule,
    header: { labelColor: theme.ink, labelFont: theme.display ?? theme.font, labelFontSize: 12, labelFontWeight: 600, labelAnchor: 'start', title: null },
    // Category keys are drawn by the page (numbered, with draft hatching); only a colour scale gets a Vega legend.
    legend: { labelColor: theme.muted, labelFont: theme.font, labelFontSize: 11, titleColor: theme.muted, titleFont: theme.font, titleFontSize: 11, titleFontWeight: 500, gradientThickness: 8, gradientLength: 180 },
    text: { font: theme.font, color: theme.ink },
    range: { category: theme.series },
  };
}
