import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { HearingsNav, HearingsPage } from '@/components/public/hearings/chrome';
import { CARD, EYEBROW } from '@/components/public/hearings/parts';
import { getT } from '@/i18n/server';
import { loadActions, loadIndex, loadRoster, loadSite } from '@/lib/hearings/api';
import { bodiesOf, clock, safeId } from '@/lib/hearings/format';

type Props = { params: Promise<{ slug: string }> };

async function find(rawSlug: string) {
  const slug = safeId(rawSlug);
  return slug ? (await loadRoster()).find((c) => c.slug === slug) : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const councilor = await find((await params).slug);
  return councilor ? { title: councilor.name } : {};
}

/** `/hearings/councilors/<slug>`: what one councilor did on the floor, as confirmed by a reviewer. */
export default async function HearingsCouncilorPage({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  const councilor = await find(slug);
  if (!councilor) notFound();
  const [index, site, actions] = await Promise.all([loadIndex(), loadSite(), loadActions(councilor.slug)]);

  return (
    <HearingsPage>
      <HearingsNav active="councilors" bodies={bodiesOf(index, site)} />
      <p className={EYEBROW}>
        <Link href="/hearings/councilors" className="underline-offset-4 hover:underline">
          ← {t('hearings.councilors.back')}
        </Link>
        {councilor.role ? ` · ${councilor.role}` : ''}
      </p>
      <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.2rem+3.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        {councilor.name}
      </h1>
      <section className={`${CARD} mt-10`}>
        <p className={EYEBROW}>{t('hearings.councilors.confirmed')}</p>
        <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{t('hearings.councilors.floor')}</h2>
        {actions.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-ink-muted">{t('hearings.councilors.none')}</p>
        ) : (
          actions.map((a, i) => {
            const session = index.find((s) => s.id === a.session_id);
            return (
              <div key={i} className="mt-4 text-sm leading-6">
                <p>
                  <strong>{a.kind}</strong> {a.text}
                </p>
                <p className="text-ink-muted">
                  <Link href={`/hearings/session/${a.session_id}?t=${Math.floor(a.at)}`} className="underline underline-offset-4">
                    {session?.title ?? a.session_id} · {clock(a.at)}
                  </Link>
                </p>
              </div>
            );
          })
        )}
      </section>
    </HearingsPage>
  );
}
