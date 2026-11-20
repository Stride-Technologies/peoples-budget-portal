import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { HearingsPage } from '@/components/public/hearings/chrome';
import { EYEBROW, MachineNotice, formatDay } from '@/components/public/hearings/parts';
import { SessionView } from '@/components/public/hearings/session-view';
import { getLocale, getT } from '@/i18n/server';
import { loadGlossary, loadGoals, loadIndex, loadLinks, loadSegments, loadSite, loadSummaries } from '@/lib/hearings/api';
import { HEARINGS_API_URL } from '@/lib/hearings/config';
import { bodiesOf, bodyOf, documentsMentioned, hours, safeId, safeUrl, summaryLangFor, termsUsed } from '@/lib/hearings/format';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

async function find(rawId: string) {
  const id = safeId(rawId);
  const index = id ? await loadIndex() : [];
  return { index, session: index.find((s) => s.id === id) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { session } = await find((await params).id);
  return session ? { title: session.title } : {};
}

/** `/hearings/session/<id>?t=<seconds>`: the video, the transcript that follows it, and the summary. */
export default async function HearingsSessionPage({ params, searchParams }: Props) {
  const [{ id }, { t: at }, t, locale] = await Promise.all([params, searchParams, getT(), getLocale()]);
  const { index, session } = await find(id);
  if (!session) notFound();
  const [segments, links, summaries, glossary, goals, site] = await Promise.all([
    loadSegments(session.id),
    loadLinks(session.id),
    loadSummaries(session.id),
    loadGlossary(),
    loadGoals(),
    loadSite(),
  ]);
  if (!segments) notFound();

  const bodies = bodiesOf(index, site);
  const body = bodies.find((b) => b.id === bodyOf(session, bodies)) ?? bodies[0];
  const first = body.id === bodies[0].id;
  const kinds: Record<string, string> = {
    ordinance: t('hearings.documents.kind.ordinance'),
    resolution: t('hearings.documents.kind.resolution'),
    proposed: t('hearings.documents.kind.proposed'),
  };
  const documents = documentsMentioned(links).map((d) => {
    const kind = kinds[d.kind] ?? d.kind ?? t('hearings.documents.kind.other');
    return { ...d, name: d.no ? `${kind} ${d.no}` : kind };
  });
  const terms = termsUsed(glossary, segments).map((e) => ({ ...e, url: safeUrl(e.url) ?? undefined }));
  const start = Math.max(0, Math.floor(Number(at)) || 0);

  return (
    <HearingsPage wide>
      <p className={EYEBROW}>
        <Link href={first ? '/hearings' : `/hearings?body=${encodeURIComponent(body.id)}`} className="underline-offset-4 hover:underline">
          ← {t('hearings.session.back')}
        </Link>
      </p>
      <p className={`${EYEBROW} mt-4`}>
        {[body.name ?? t('hearings.session.eyebrow'), formatDay(session.date, locale === 'fil' ? 'fil-PH' : 'en-PH')].filter(Boolean).join(' · ')}
      </p>
      <h1 className="mt-3 max-w-[48rem] font-display text-[clamp(1.75rem,1.2rem+2.4vw,3rem)] font-medium leading-[1.08] tracking-[-0.03em]">
        {session.title}
      </h1>
      <p className="mt-4 max-w-[40rem] text-base leading-7 text-ink-muted">
        {t('hearings.session.lede', { hours: hours(session.durationSec) })}
      </p>
      <MachineNotice label={t('hearings.notice.label')}>{t('hearings.notice.session')}</MachineNotice>

      <SessionView
        key={session.id}
        apiUrl={HEARINGS_API_URL}
        session={session}
        segments={segments}
        summaries={summaries}
        initialLang={summaryLangFor(locale)}
        documents={documents}
        terms={terms}
        goalNames={goals.finishLines}
        start={start}
      />
    </HearingsPage>
  );
}
