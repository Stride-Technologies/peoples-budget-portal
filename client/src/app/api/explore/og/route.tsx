import { ImageResponse } from 'next/og';
import { translator, type MessageKey } from '@/i18n/t';
import { apiExploreDefault, apiExploreView } from '@/lib/api';
import { compactPeso } from '@/lib/currency-formatter';
import { fmt } from '@/lib/explore/chart-data';
import { getBrand } from '@/lib/brand-server';
import { SITE_URL } from '@/lib/seo';

const W = 1200;
const H = 630;
const ROWS = 6;
const PAPER = '#FDFDF8';
const INK = '#151414';
const MUTED = '#5A5754';
const RULE = '#E5E3DC';

/**
 * The share image of one explorer view (specs/018 T016): its title, its
 * largest rows as bars and its total, so a shared link previews the chart
 * itself. Same view grammar as the page; a view that will not resolve gets the
 * site image. Public under `/api/explore` (client-owned; see nginx.conf).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let r;
  try {
    r = params.has('s') ? await apiExploreView(params) : await apiExploreDefault();
  } catch {
    // Relative Location: request.url is the bind address in the container (ARCHITECTURE-ESSENTIALS).
    return new Response(null, { status: 307, headers: { Location: '/api/og' } });
  }
  const t = translator('en');
  const brand = await getBrand();
  const s = r.series[0];
  const by = t(`explore.dim.${r.view.groupBy}` as MessageKey).toLowerCase();
  const title = `${r.series.map((x) => x.label).join(' vs ')}, by ${by}`;
  const rows = s.rows.slice(0, ROWS);
  const max = Math.max(...rows.map((x) => Number(x.value)), 1);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: PAPER, color: INK, padding: '56px 64px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>
          People’s Budget Portal · {brand.placeName}
        </div>
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, marginTop: 14, lineHeight: 1.15 }}>
          {title.length > 90 ? `${title.slice(0, 89)}…` : title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, flexGrow: 1 }}>
          {rows.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', width: 360, fontSize: 24, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {x.label.length > 28 ? `${x.label.slice(0, 27)}…` : x.label}
              </div>
              <div style={{ display: 'flex', width: 560, height: 26 }}>
                <div style={{ display: 'flex', width: `${Math.max(1, (Number(x.value) / max) * 100)}%`, height: 26, background: x.accent ?? INK, borderRadius: 3 }} />
              </div>
              <div style={{ display: 'flex', marginLeft: 20, fontSize: 24, fontWeight: 600 }}>{fmt(s, x.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${RULE}`, paddingTop: 18, fontSize: 22, color: MUTED }}>
          <div style={{ display: 'flex' }}>
            {s.total !== null && `${t('explore.total')}: ${s.measure === 'money' ? compactPeso(s.total) : s.total}`}
            {s.rows.length > ROWS ? ` · ${s.rows.length - ROWS} more in the table` : ''}
          </div>
          <div style={{ display: 'flex' }}>{new URL('/explore', SITE_URL).host}/explore</div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
