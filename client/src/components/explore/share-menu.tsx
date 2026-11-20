'use client';

/**
 * Share = the link plus exports (R17). PNG and SVG come from the chart's own
 * SVG node, which already carries the title and source line; CSV from the
 * rows the server resolved; XLSX from a same-origin route handler. Nothing is
 * saved on a server — the link *is* the saved chart.
 */
import { useState } from 'react';
import { useT } from '@/i18n/locale-provider';
import { localRefs } from '@/lib/explore/export-frame';

export function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The chart SVG as standalone markup, its theme colour baked in. */
export function svgMarkup(svgId: string): string | null {
  const svg = document.getElementById(svgId);
  if (!(svg instanceof SVGSVGElement)) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('color', getComputedStyle(svg).color);
  clone.setAttribute('width', String(svg.viewBox.baseVal.width));
  clone.setAttribute('height', String(svg.viewBox.baseVal.height));
  return localRefs(new XMLSerializer().serializeToString(clone));
}

/**
 * The page's own `@font-face` rules for these families, each font file inlined
 * as a data URL. An SVG drawn as an image loads nothing, so without this a PNG
 * falls back to a system face (specs/020 A1.6). Same-origin files only.
 */
export async function inlineFonts(families: string[]): Promise<string> {
  const names = new Set(families.flatMap((f) => f.split(',')).map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean));
  const rules = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    })
    .filter((r): r is CSSFontFaceRule => r instanceof CSSFontFaceRule && names.has(r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim()));
  const out = await Promise.all(
    rules.map(async (r) => {
      const src = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/)?.[1];
      if (!src) return '';
      try {
        const blob = await (await fetch(new URL(src, r.parentStyleSheet?.href ?? location.href))).blob();
        const data = await new Promise<string>((ok) => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result as string);
          fr.readAsDataURL(blob);
        });
        return `@font-face{${r.style.cssText.replace(/src:[^;]+;?/, `src:url(${data});`)}}`;
      } catch {
        return '';
      }
    }),
  );
  return out.join('');
}

/** The chart SVG drawn to a 2× PNG and downloaded. */
export function downloadPng(svgId: string, fileBase: string) {
  const markup = svgMarkup(svgId);
  if (markup) pngFromMarkup(markup, fileBase);
}

/** Standalone SVG markup drawn to a 2× PNG and downloaded. */
export function pngFromMarkup(markup: string, fileBase: string) {
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((b) => b && download(`${fileBase}.png`, b), 'image/png');
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export function ShareMenu({ svgId, fileBase, csv, query }: { svgId: string | null; fileBase: string; csv: string; query: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = () => window.location.href;
  const btn = 'inline-flex min-h-11 items-center rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-ink/40';

  const png = () => svgId && downloadPng(svgId, fileBase);

  return (
    <section aria-labelledby="explore-share" className="space-y-3">
      <h2 id="explore-share" className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
        {t('explore.share')}
      </h2>
      <p className="text-sm text-ink-faint">{t('explore.share.note')}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ url: url() });
              else {
                await navigator.clipboard.writeText(url());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            } catch {
              /* the visitor closed the share sheet */
            }
          }}
        >
          <span aria-live="polite">{copied ? t('explore.share.copied') : t('explore.share.copy')}</span>
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`, '_blank', 'noopener,noreferrer')}
        >
          {t('explore.share.facebook')}
        </button>
        {svgId && (
          <>
            <button type="button" className={btn} onClick={png}>{t('explore.share.png')}</button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const m = svgMarkup(svgId);
                if (m) download(`${fileBase}.svg`, new Blob([m], { type: 'image/svg+xml' }));
              }}
            >
              {t('explore.share.svg')}
            </button>
          </>
        )}
        <button type="button" className={btn} onClick={() => download(`${fileBase}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }))}>
          {t('explore.share.csv')}
        </button>
        <a className={btn} href={`/api/explore/export?${query}`} download>
          {t('explore.share.xlsx')}
        </a>
      </div>
    </section>
  );
}
