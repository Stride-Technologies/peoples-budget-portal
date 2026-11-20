import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { HearingsNav, HearingsPage } from '@/components/public/hearings/chrome';
import { CARD, EYEBROW } from '@/components/public/hearings/parts';
import { getT } from '@/i18n/server';
import { loadIndex, loadRoster, loadSite } from '@/lib/hearings/api';
import { bodiesOf } from '@/lib/hearings/format';

/** `/hearings/councilors`: the council's members, each leading to what they did on the floor. */
export default async function HearingsCouncilorsPage() {
  const t = await getT();
  const [index, site, roster] = await Promise.all([loadIndex(), loadSite(), loadRoster()]);
  return (
    <HearingsPage>
      <HearingsNav active="councilors" bodies={bodiesOf(index, site)} />
      <p className={EYEBROW}>{t('hearings.nav.councilors')}</p>
      <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.2rem+3.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        {t('hearings.councilors.title')}
      </h1>
      <p className="mt-5 max-w-[38rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">{t('hearings.councilors.lede')}</p>
      {roster.length === 0 ? (
        <p className="mt-12 text-ink-muted">{t('hearings.councilors.empty')}</p>
      ) : (
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((c) => (
            <li key={c.slug} className={CARD}>
              {c.role && <p className={EYEBROW}>{c.role}</p>}
              <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">
                <Link href={`/hearings/councilors/${c.slug}`} className="hover:underline hover:underline-offset-4">
                  {c.name}
                </Link>
              </h2>
            </li>
          ))}
        </ul>
      )}
    </HearingsPage>
  );
}
