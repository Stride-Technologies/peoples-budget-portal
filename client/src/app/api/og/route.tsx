import { ImageResponse } from 'next/og';
import { getBrand } from '@/lib/brand-server';
import { VISIONS } from '@/lib/finish-lines';
import { SITE_URL } from '@/lib/seo';

const W = 1200;
const H = 630;

/**
 * The site's share image (`OG_IMAGES` in lib/seo.ts): the portal's name and whose it is, drawn
 * from the `LGU_*` settings, so no deployment ships another LGU's card. Public, and owned by
 * the client (nginx sends only `/api/v1/*` to the API).
 */
export async function GET() {
  const brand = await getBrand();
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#151414', color: '#FDFDF8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '0 80px' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: '#B9B5AC' }}>{brand.government}</div>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, marginTop: 22, lineHeight: 1.05 }}>People’s Budget Portal</div>
          <div style={{ display: 'flex', fontSize: 34, marginTop: 28, color: '#D8D5CC' }}>
            Where {brand.shortName}’s money goes, in plain sight.
          </div>
          <div style={{ display: 'flex', fontSize: 24, marginTop: 44, color: '#8F8B83' }}>{new URL(SITE_URL).host}</div>
        </div>
        <div style={{ display: 'flex', height: 14 }}>
          {VISIONS.map((v) => (
            <div key={v.id} style={{ display: 'flex', flexGrow: 1, background: v.color }} />
          ))}
        </div>
      </div>
    ),
    { width: W, height: H, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
