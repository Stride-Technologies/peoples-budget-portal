'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n/locale-provider';
import {
  SUMMARY_LANGS,
  checkRefs,
  clock,
  segmentAt,
  wordTimes,
  type DocumentLink,
  type GlossaryEntry,
  type Segment,
  type SessionEntry,
  type Summary,
  type SummaryLang,
} from '@/lib/hearings/format';
import { cn } from '@/lib/utils';
import { CARD, EYEBROW, GoalDot } from './parts';
import { Player, type PlayerHandle } from './player';

const LANG_NAME: Record<SummaryLang, string> = { en: 'English', tl: 'Filipino', bcl: 'Bikol' };
const LANG_TAG: Record<SummaryLang, string> = { en: 'en', tl: 'fil', bcl: 'bcl' };
const TIME = 'font-mono text-xs tabular-nums text-ink-muted underline-offset-4 hover:text-ink hover:underline';
const CHIP =
  'inline-flex min-h-8 items-center rounded-full border border-rule bg-paper px-2.5 font-mono text-xs tabular-nums text-ink-muted transition-colors hover:border-ink hover:text-ink';

/** A document as the page shows it: `name` is "Ordinance 2026-012", made on the server. */
export type SessionDocument = DocumentLink & { refs: number[]; name: string };

export interface SessionViewProps {
  apiUrl: string;
  session: SessionEntry;
  segments: Segment[];
  summaries: Partial<Record<SummaryLang, Summary>>;
  initialLang: SummaryLang;
  /** Documents named in the session, one entry each, with the lines that mention them. */
  documents: SessionDocument[];
  /** Glossary terms said in the session. */
  terms: (GlossaryEntry & { refs: number[]; url?: string })[];
  /** Goal names by number, for the dots' labels. */
  goalNames: Record<string, string>;
  /** Seconds to start at, from `?t=`. */
  start: number;
}

/** The session page's working part: the video, the transcript that follows it, and the summary. */
export function SessionView({ apiUrl, session, segments, summaries, initialLang, documents, terms, goalNames, start }: SessionViewProps) {
  const t = useT();
  const player = useRef<PlayerHandle>(null);
  const list = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLParagraphElement>(null);
  const [cur, setCur] = useState(-1);
  const [query, setQuery] = useState('');
  const [showAired, setShowAired] = useState(false);
  const [lang, setLang] = useState<SummaryLang>(summaries[initialLang] ? initialLang : 'en');

  const seek = (seconds: number) => player.current?.seek(seconds);
  const aired = useMemo(() => segments.filter((g) => g.skip).length, [segments]);
  const linksBySeg = useMemo(() => {
    const by = new Map<number, SessionDocument[]>();
    for (const d of documents) for (const i of d.refs) by.set(i, [...(by.get(i) ?? []), d]);
    return by;
  }, [documents]);
  const times = useMemo(() => (cur >= 0 ? wordTimes(segments[cur]) : []), [cur, segments]);

  // Follow the video: which line is being said, and which word of it.
  useEffect(() => {
    const id = setInterval(() => {
      const at = player.current?.time();
      if (at == null) return;
      const i = segmentAt(segments, at);
      setCur((was) => (was === i ? was : i));
      // Word by word, straight on the DOM: a state change eight times a second would redraw the transcript.
      const words = now.current?.querySelectorAll<HTMLElement>('[data-w]');
      let last = -1;
      words?.forEach((el, j) => {
        const said = Number(el.dataset.w) <= at;
        el.toggleAttribute('data-said', said);
        el.removeAttribute('data-cur');
        if (said) last = j;
      });
      words?.[last]?.setAttribute('data-cur', '');
    }, 150);
    return () => clearInterval(id);
  }, [segments]);

  // Keep the line being said in view, a third of the way down its own scroll box.
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-i="${cur}"]`);
    if (!box || !row) return;
    box.scrollTo({
      top: row.offsetTop - box.offsetTop - box.clientHeight / 3,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [cur]);

  const q = query.trim().toLowerCase();
  const rows = segments.flatMap((g, i) => ((g.skip && !showAired) || (q && !g.text.toLowerCase().includes(q)) ? [] : [{ g, i }]));
  const said = cur >= 0 ? segments[cur] : null;
  const summary = summaries[lang] ?? null;
  const offered = SUMMARY_LANGS.filter((l) => summaries[l]);

  const chips = (refs: number[] | undefined) => (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {checkRefs(refs).map((i) =>
        segments[i] ? (
          <button key={i} type="button" className={CHIP} onClick={() => seek(segments[i].start)} aria-label={t('hearings.session.playFrom', { time: clock(segments[i].start) })}>
            {clock(segments[i].start)}
          </button>
        ) : null,
      )}
    </span>
  );
  const dots = (numbers: number[] | undefined) =>
    (numbers ?? []).map((n) => <GoalDot key={n} n={n} name={goalNames[String(n)]} />);

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0">
        <Player
          ref={player}
          apiUrl={apiUrl}
          session={session}
          start={start}
          labels={{ play: t('hearings.session.play'), unavailable: t('hearings.session.noVideo') }}
        />

        <p ref={now} className={cn(CARD, 'mt-4 min-h-[5.5rem] text-lg leading-8')}>
          {!said ? (
            <em className="text-base text-ink-muted">{t('hearings.session.idle')}</em>
          ) : (
            <>
              <button type="button" className={cn(TIME, 'mr-2')} onClick={() => seek(said.start)}>
                {clock(said.start)}
              </button>
              {said.skip ? (
                <em className="text-base text-ink-muted">{t('hearings.session.airedNow')}</em>
              ) : (
                said.text.split(' ').map((w, j) => (
                  <span key={`${cur}-${j}`} data-w={times[j]} className="text-ink-faint data-[said]:text-ink data-[cur]:underline data-[cur]:decoration-2 data-[cur]:underline-offset-4">
                    {w}{' '}
                  </span>
                ))
              )}
            </>
          )}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="sr-only" htmlFor="hearings-q">
            {t('hearings.session.search')}
          </label>
          <input
            id="hearings-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('hearings.session.search')}
            className="h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper-raised px-3 text-base text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {aired > 0 && (
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={showAired} onChange={(e) => setShowAired(e.target.checked)} className="size-4" />
              {t('hearings.session.showAired', { count: aired })}
            </label>
          )}
        </div>

        <div ref={list} role="list" aria-label={t('hearings.session.transcript')} className="mt-4 max-h-[70vh] overflow-y-auto rounded-xl border border-rule bg-paper-raised">
          {rows.length === 0 && <p className="p-6 text-sm text-ink-muted">{t('hearings.session.noMatch')}</p>}
          {rows.map(({ g, i }) => (
            <div
              key={i}
              role="listitem"
              data-i={i}
              className={cn('flex gap-3 border-b border-rule px-4 py-3 last:border-b-0', i === cur && 'bg-paper-tint', g.skip && 'opacity-70')}
            >
              <button type="button" className={cn(TIME, 'min-h-8 shrink-0 self-start')} onClick={() => seek(g.start)} aria-label={t('hearings.session.playFrom', { time: clock(g.start) })}>
                {clock(g.start)}
              </button>
              <p className="min-w-0 text-base leading-7">
                {g.skip && (
                  <span className={cn(EYEBROW, 'mr-2 rounded border border-rule px-1.5 py-0.5')} title={t('hearings.session.airedHint')}>
                    {t('hearings.session.aired')}
                  </span>
                )}
                {/* The whole line is a shortcut for mouse users; the timestamp is the control. */}
                <span className="cursor-pointer" onClick={() => seek(g.start)}>
                  {g.text}
                </span>
                {g.reviewed && (
                  <span className="ml-2 whitespace-nowrap text-xs font-medium text-ink-muted" title={t('hearings.session.reviewedHint')}>
                    ✓ {t('hearings.session.reviewed')}
                  </span>
                )}
                {(linksBySeg.get(i) ?? []).map((d) => (
                  <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" title={d.title} className="ml-2 whitespace-nowrap text-sm underline underline-offset-4">
                    {d.name} ↗
                  </a>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {offered.length > 1 && (
          <div role="group" aria-label={t('hearings.summary.language')} className="flex flex-wrap gap-2">
            {offered.map((l) => (
              <button
                key={l}
                type="button"
                lang={LANG_TAG[l]}
                aria-pressed={l === lang}
                onClick={() => setLang(l)}
                className={cn(CHIP, 'min-h-11 px-4 font-sans text-sm', l === lang && 'border-ink bg-ink text-paper hover:text-paper')}
              >
                {LANG_NAME[l]}
              </button>
            ))}
          </div>
        )}

        {!summary ? (
          <section className={CARD}>
            <p className="text-sm text-ink-muted">{t('hearings.summary.none')}</p>
          </section>
        ) : (
          <div lang={LANG_TAG[lang]} className="space-y-4">
            <p className="rounded-lg border border-rule bg-paper-tint px-4 py-3 text-sm leading-6 text-ink-muted">
              <span className={cn(EYEBROW, 'mr-2')}>{t('hearings.summary.ai')}</span>
              {lang === 'en' ? t('hearings.summary.note') : t('hearings.summary.noteTranslated')}
            </p>
            <section className={cn(CARD, 'bg-paper-tint')}>
              <p className={EYEBROW}>{t('hearings.summary.glance')}</p>
              <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{t('hearings.summary.what')}</h2>
              {summary.headline && <p className="mt-3 text-base font-medium leading-7">{summary.headline}</p>}
              {summary.glance.map((g, i) => (
                <div key={i} className="mt-4 text-sm leading-6">
                  <p>
                    <strong>{g.lead}.</strong> {g.text}
                  </p>
                  {chips(g.refs)}
                </div>
              ))}
            </section>
            {summary.sections.map((x, i) => (
              <section key={i} className={CARD}>
                <p className={EYEBROW}>
                  {t('hearings.summary.theme')} {String(i + 1).padStart(2, '0')}
                </p>
                <h2 className="mt-2 flex flex-wrap items-center gap-2 font-display text-xl font-medium tracking-[-0.02em]">
                  {x.title}
                  {dots(x.finishLines)}
                </h2>
                {x.items.map((g, j) => (
                  <div key={j} className="mt-4 text-sm leading-6">
                    <p>
                      <strong>{g.lead}</strong> {g.text}
                    </p>
                    {chips(g.refs)}
                  </div>
                ))}
              </section>
            ))}
            {summary.issues.length > 0 && (
              <section className={CARD}>
                <p className={EYEBROW}>{t('hearings.summary.issues')}</p>
                <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{t('hearings.summary.discussed')}</h2>
                {summary.issues.map((g, i) => (
                  <div key={i} className="mt-4 text-sm leading-6">
                    <p>
                      <strong>{g.topic}</strong> — {g.summary}
                    </p>
                    {(g.offices ?? []).length > 0 && <p className="text-ink-muted">{g.offices!.join(' · ')}</p>}
                    {((g.finishLines ?? []).length > 0 || g.cluster) && (
                      <p className="mt-2 flex flex-wrap items-center gap-2">
                        {dots(g.finishLines)}
                        {g.cluster && <span className="rounded-full border border-rule px-2.5 py-0.5 text-xs text-ink-muted">{g.cluster}</span>}
                      </p>
                    )}
                    {chips(g.refs)}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {documents.length > 0 && (
          <section className={CARD}>
            <p className={EYEBROW}>{t('hearings.documents.eyebrow')}</p>
            <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{t('hearings.documents.title')}</h2>
            <ul className="mt-4 space-y-4 text-sm leading-6">
              {documents.map((d) => (
                <li key={d.url}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
                    {d.name} ↗
                  </a>
                  <span className="block text-ink-muted">{d.title}</span>
                  {chips(d.refs)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-ink-faint">{t('hearings.documents.note')}</p>
          </section>
        )}

        {terms.length > 0 && (
          <section className={CARD}>
            <p className={EYEBROW}>{t('hearings.terms.eyebrow')}</p>
            <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{t('hearings.terms.title')}</h2>
            <ul className="mt-4 space-y-4 text-sm leading-6">
              {terms.map((e) => (
                <li key={e.term}>
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
                      {e.term}
                      {e.short ? ` (${e.short})` : ''} ↗
                    </a>
                  ) : (
                    <span className="font-medium">
                      {e.term}
                      {e.short ? ` (${e.short})` : ''}
                    </span>
                  )}
                  <span className="block text-ink-muted">{e.definition}</span>
                  {chips(e.refs)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
