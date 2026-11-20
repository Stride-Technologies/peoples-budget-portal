import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { HearingsNav, HearingsPage } from '@/components/public/hearings/chrome';
import { CARD, EYEBROW, GoalDot, MachineNotice, formatDay } from '@/components/public/hearings/parts';
import { getLocale, getT } from '@/i18n/server';
import { loadGoals, loadIndex, loadSite, loadSummary } from '@/lib/hearings/api';
import { HEARINGS_API_URL } from '@/lib/hearings/config';
import { bodiesOf, bodyOf, hours, posterUrl, summaryLangFor } from '@/lib/hearings/format';

/** `/hearings`: the sessions of one body, newest first, each with what was discussed. */
export default async function HearingsListPage({ searchParams }: { searchParams: Promise<{ body?: string }> }) {
  const [{ body: asked }, t, locale] = await Promise.all([searchParams, getT(), getLocale()]);
  const [index, site, goals] = await Promise.all([loadIndex(), loadSite(), loadGoals()]);
  const bodies = bodiesOf(index, site);
  const body = bodies.find((b) => b.id === asked) ?? bodies[0];
  const sessions = index.filter((s) => bodyOf(s, bodies) === body.id);
  const lang = summaryLangFor(locale);
  const summaries = await Promise.all(sessions.map((s) => loadSummary(s.id, lang)));
  const dateTag = locale === 'fil' ? 'fil-PH' : 'en-PH';

  return (
    <HearingsPage>
      <HearingsNav active={`body:${body.id}`} bodies={bodies} />
      <p className={EYEBROW}>{t('hearings.list.eyebrow')}</p>
      <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.2rem+3.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        {body.name ?? t('hearings.list.title')}
      </h1>
      <p className="mt-5 max-w-[38rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
        {body.about ?? t('hearings.list.lede')}
      </p>
      <MachineNotice label={t('hearings.notice.label')}>{t('hearings.notice.list')}</MachineNotice>

      {sessions.length === 0 ? (
        <p className="mt-12 text-ink-muted">{t('hearings.list.empty')}</p>
      ) : (
        <ul className="mt-12 grid gap-6 sm:grid-cols-2">
          {sessions.map((s, i) => {
            const summary = summaries[i];
            const goalNumbers = [...new Set((summary?.issues ?? []).flatMap((x) => x.finishLines ?? []))].sort((a, b) => a - b);
            const href = `/hearings/session/${s.id}`;
            return (
              <li key={s.id} className={`${CARD} flex flex-col`}>
                <Link href={href} tabIndex={-1} aria-hidden="true" className="-mx-6 -mt-6 mb-5 block overflow-hidden rounded-t-xl bg-ink">
                  {/* A poster on the video host: next/image would need every hearings host configured. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={posterUrl(HEARINGS_API_URL, s)} alt="" loading="lazy" width={480} height={270} className="aspect-video w-full object-cover" />
                </Link>
                <p className={EYEBROW}>
                  {[formatDay(s.date, dateTag), t('hearings.hours', { hours: hours(s.durationSec) })].filter(Boolean).join(' · ')}
                </p>
                <h2 className="mt-2 font-display text-2xl font-medium tracking-[-0.02em]">
                  <Link href={href} className="hover:underline hover:underline-offset-4">
                    {s.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">
                  {summary ? summary.headline ?? `${summary.glance.map((g) => g.lead).join('; ')}.` : t('hearings.list.noSummary')}
                </p>
                {goalNumbers.length > 0 && (
                  <p className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                    {goalNumbers.map((n) => (
                      <GoalDot key={n} n={n} name={goals.finishLines[String(n)]} />
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </HearingsPage>
  );
}
