/**
 * A downloaded chart that can be checked (specs/020 A1.6): the chart SVG framed
 * with its title, subtitle, numbered legend, the source documents, the date,
 * the portal's mark, a link back to the exact view and a short hash of the
 * query. Everything printed is text the page already computed; nothing here
 * reads a figure. Pure, so it is tested in Node; the browser half (fonts, the
 * snapshot link) is in `workspace.tsx`.
 */

export interface Frame {
  /** The chart's own SVG markup and its size. */
  inner: string;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  legend: { label: string; colour: string; draft: boolean }[];
  sources: string;
  made: string;
  portal: string;
  link: string;
  hash: string;
  /** `@font-face` rules with the fonts as data URLs, so a PNG's text matches the screen. */
  fontCss: string;
  font: string;
  display: string;
  colours: { paper: string; ink: string; muted: string; rule: string };
}

/**
 * Vega points gradients at the page (`url(https://…/explore#gradient_0)`); outside
 * the page that resolves nowhere and a colour key exports blank, so references
 * are pointed at the file itself.
 */
export const localRefs = (svg: string) => svg.replace(/url\((["']?)[^)#"']*#/g, 'url($1#');

const esc = (x: string) => x.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Lines of at most `max` characters, broken at spaces. ponytail: characters, not measured glyph widths. */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** A short, stable id for a query: the first 12 hex digits of SHA-256 over its canonical JSON. */
export async function queryHash(query: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(query));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function frameSvg(f: Frame): string {
  const M = 32;
  const W = Math.max(f.width + M * 2, 480);
  const chars = (size: number) => Math.floor((W - M * 2) / (size * 0.55));
  const c = f.colours;
  const parts: string[] = [];
  let y = M;
  const text = (s: string, size: number, opts: { fill?: string; weight?: number; font?: string; x?: number } = {}) =>
    `<text x="${opts.x ?? M}" y="${y}" font-family="${esc(opts.font ?? f.font)}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? c.ink}">${esc(s)}</text>`;

  // The portal's mark: a small ink block and the name, like the workspace's top bar.
  parts.push(`<rect x="${M}" y="${y - 11}" width="14" height="14" rx="2" fill="${c.ink}"/>`);
  parts.push(`<text x="${M + 7}" y="${y}" text-anchor="middle" font-family="${esc(f.display)}" font-size="10" font-weight="700" fill="${c.paper}">N</text>`);
  parts.push(text(f.portal.toUpperCase(), 10, { x: M + 22, weight: 600, fill: c.muted }));
  y += 30;
  for (const line of wrap(f.title, chars(22))) {
    parts.push(text(line, 22, { weight: 700, font: f.display }));
    y += 26;
  }
  for (const line of wrap(f.subtitle, chars(13))) {
    parts.push(text(line, 13, { fill: c.muted }));
    y += 18;
  }
  // A numbered legend (the blueprint key): swatch, number, label; wraps to the width.
  if (f.legend.length) {
    y += 6;
    let x = M;
    f.legend.forEach((k, i) => {
      const label = `${i + 1}  ${k.label}${k.draft ? ' (draft)' : ''}`;
      const w = 18 + label.length * 6.6 + 18;
      if (x > M && x + w > W - M) {
        x = M;
        y += 20;
      }
      parts.push(`<rect x="${x}" y="${y - 10}" width="12" height="12" rx="2" fill="${k.draft ? c.paper : k.colour}" stroke="${k.colour}" stroke-width="${k.draft ? 2 : 0}"/>`);
      parts.push(text(label, 12, { x: x + 18 }));
      x += w;
    });
    y += 10;
  }
  y += 8;
  parts.push(`<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${c.rule}" stroke-width="1"/>`);
  y += 12;
  parts.push(`<g transform="translate(${M},${y})">${f.inner.replace('<svg', '<svg overflow="visible"')}</g>`);
  y += f.height + 16;
  parts.push(`<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${c.rule}" stroke-width="1"/>`);
  y += 18;
  for (const line of wrap(f.sources, chars(11))) {
    parts.push(text(line, 11, { fill: c.muted }));
    y += 15;
  }
  parts.push(text(`${f.made} · ${f.link} · ${f.hash}`, 11, { fill: c.muted }));
  y += M - 8;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">` +
    (f.fontCss ? `<defs><style>${f.fontCss}</style></defs>` : '') +
    `<rect width="100%" height="100%" fill="${c.paper}"/>${parts.join('')}</svg>`
  );
}
