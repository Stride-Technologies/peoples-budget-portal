'use client';

/**
 * The chat column (specs/018 redesign P5, W22–W29). A question and the open
 * sheet go to the chat agent; its answer changes the sheet (one undo step)
 * and says, in two or three sentences, what it shows. Every figure is the
 * engine's. Under it: what was counted (W26 coverage), the top five PPAs and
 * "See all", next steps and other readings. Budget terms are explained on
 * hover, tap or focus. The transcript lives here only: never saved, never in
 * a link; the agent sees the last four turns of this tab (W27).
 *
 * Each sheet has its own thread (P7, owner's ask 2026-11-12), and Clear empties
 * the open sheet's. An answer lands on the sheet it was asked from, even when
 * another sheet is open by the time it comes back.
 */
import { useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowUp, Check, Eraser, MessageCircle, PanelRightClose } from 'lucide-react';
import { useLocale, useT } from '@/i18n/locale-provider';
import { chatExplorer } from '@/app/(public)/explore/_actions';
import { ExplainFeedback } from '@/components/explore/feedback';
import { MicButton } from '@/components/explore/mic-button';
import { TrainingConsent } from '@/components/explore/training-consent';
import type { ExploreChatResult } from '@/lib/api';
import { formatValue } from '@/lib/explore/compile';
import { consentField } from '@/lib/explore/consent';
import { deviceKey } from '@/lib/explore/device-key';
import { gloss } from '@/lib/explore/gloss';
import type { Mark, WorkbookQuery } from '@/lib/explore/workbook';

type Changed = { sheet: string; undo: () => void; undone?: boolean };
type Msg =
  | { id: number; who: 'user'; text: string }
  | { id: number; who: 'ai'; q: string; r: ExploreChatResult; changed?: Changed }
  | { id: number; who: 'applied'; label: string; changed: Changed }
  | { id: number; who: 'error'; reason: 'limit' | 'failed' | 'resting' };

const TURNS = 4;

export function ChatColumn({
  micSeconds,
  training = false,
  sheetId,
  sheetName,
  sheet,
  onQuery,
  onRecords,
  onHide,
  hidden,
}: {
  micSeconds?: number;
  /** Show the "help improve" box (the LGU switched training capture on). */
  training?: boolean;
  /** The sheet whose thread is shown: the active one. */
  sheetId: string;
  sheetName: string;
  /** The open sheet: a follow-up changes it (null on a dashboard or a blank sheet). */
  sheet: { query: WorkbookQuery; mark: Mark } | null;
  /** Applies a query to that sheet and opens it; returns its name and how to undo it, or nothing when the sheet is gone. */
  onQuery: (query: WorkbookQuery, mark: Mark, sheetId: string) => Changed | undefined;
  /** Opens the Records view of the active sheet: the PPAs counted. */
  onRecords: () => void;
  onHide: () => void;
  /** Hidden rather than unmounted, so the threads survive. */
  hidden?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [consent, setConsent] = useState(false);
  // Sheet id → its thread, and the sheets waiting for an answer.
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [waiting, setWaiting] = useState<string[]>([]);
  const msgs = threads[sheetId] ?? [];
  const busy = waiting.includes(sheetId);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const push = (to: string, m: Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never) => {
    setThreads((th) => ({ ...th, [to]: [...(th[to] ?? []), { ...m, id: ++seq.current } as Msg] }));
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
  };

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const to = sheetId;
    push(to, { who: 'user', text });
    setQ('');
    setWaiting((w) => [...w, to]);
    const turns = msgs
      .filter((m): m is Extract<Msg, { who: 'ai' }> => m.who === 'ai' && !!m.r.reading)
      .slice(-TURNS)
      .map((m) => ({ q: m.q, reading: m.r.reading }));
    const r = await chatExplorer({ q: text, lang: locale, deviceKey: deviceKey(), ...consentField(training, consent), sheet, turns });
    setWaiting((w) => w.filter((x) => x !== to));
    if ('error' in r) return push(to, { who: 'error', reason: r.error });
    if (r.mode === 'resting') return push(to, { who: 'error', reason: 'resting' });
    const changed = r.query ? onQuery(r.query, r.mark ?? 'auto', to) : undefined;
    push(to, { who: 'ai', q: text, r, ...(changed ? { changed } : {}) });
  }

  const apply = (label: string, query: WorkbookQuery) => {
    const changed = onQuery(query, 'auto', sheetId);
    if (changed) push(sheetId, { who: 'applied', label, changed });
  };

  const undo = (id: number) => {
    const m = msgs.find((x) => x.id === id);
    if (!m || !('changed' in m) || !m.changed || m.changed.undone) return;
    m.changed.undo();
    setThreads((th) => ({
      ...th,
      [sheetId]: (th[sheetId] ?? []).map((x) => (x.id === id && 'changed' in x && x.changed ? { ...x, changed: { ...x.changed, undone: true } } : x)),
    }));
  };

  // The conversation only: the sheet keeps what the chat changed (Undo is for that).
  const clear = () =>
    setThreads((th) => {
      const { [sheetId]: _gone, ...rest } = th;
      void _gone;
      return rest;
    });

  return (
    <aside className="chat" aria-label={t('explore.ws.chat')} hidden={hidden}>
      <div className="chat-h">
        <MessageCircle size={16} aria-hidden />
        <b>{t('explore.ask.submit')}</b>
        <small>{t('explore.ws.chatNote')}</small>
        <span className="spacer" />
        <button type="button" className="iconbtn" aria-label={t('explore.chat.clear')} title={t('explore.chat.clear')} onClick={clear} disabled={!msgs.length || busy} data-testid="chat-clear">
          <Eraser size={16} />
        </button>
        <button type="button" className="iconbtn" aria-label={t('explore.ws.hideChat')} title={t('explore.ws.hideChat')} onClick={onHide}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="msgs" ref={list} role="log" aria-live="polite">
        <div className="welcome">
          <b>{t('explore.chat.welcome')}</b>
          {t('explore.chat.welcomeNote')}
          <span className="for-sheet" data-testid="chat-sheet">{t('explore.chat.forSheet', { sheet: sheetName })}</span>
        </div>
        {msgs.map((m) =>
          m.who === 'user' ? (
            <div key={m.id} className="msg-user">
              {m.text}
            </div>
          ) : m.who === 'error' ? (
            <div key={m.id} className="msg-ai msg-err">
              <p>{t(m.reason === 'resting' ? 'explore.chat.resting' : m.reason === 'limit' ? 'explore.ask.limit' : 'explore.ask.failed')}</p>
            </div>
          ) : m.who === 'applied' ? (
            <div key={m.id} className="msg-ai">
              <Applied label={m.label} changed={m.changed} onUndo={() => undo(m.id)} />
            </div>
          ) : (
            <Answer key={m.id} m={m} onUndo={() => undo(m.id)} onApply={apply} onRecords={onRecords} />
          ),
        )}
        {busy && <p className="msg-ai msg-err">{t('explore.ask.working')}</p>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label htmlFor="ws-ask" className="sr">
          {t('explore.ask.label')}
        </label>
        <textarea
          id="ws-ask"
          rows={2}
          maxLength={300}
          value={q}
          placeholder={t('explore.chat.placeholder')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(q);
            }
          }}
        />
        <div className="composer-row">
          <small>{t('explore.ws.languages')}</small>
          <span className="spacer" />
          {micSeconds !== undefined && <MicButton maxSeconds={micSeconds} onText={setQ} />}
          <button type="submit" className="send" aria-label={t('explore.ask.submit')} disabled={!q.trim() || busy}>
            <ArrowUp size={16} />
          </button>
        </div>
        {training && <TrainingConsent id="ws-ask-consent" checked={consent} onChange={setConsent} className="mt-1.5 border-t border-rule pt-1.5" />}
      </form>
    </aside>
  );
}

function Applied({ label, changed, onUndo }: { label?: string; changed: Changed; onUndo: () => void }) {
  const t = useT();
  return (
    <div className="applied">
      <div className="applied-h">
        <Check size={14} aria-hidden />
        <span>
          {label ? `${label} · ` : ''}
          {t('explore.ws.changed', { sheet: changed.sheet })}
        </span>
        {changed.undone ? (
          <span style={{ marginLeft: 'auto' }}>{t('explore.ws.undone')}</span>
        ) : (
          <button type="button" className="linkbtn" onClick={onUndo} style={{ marginLeft: 'auto' }}>
            {t('explore.ws.undo')}
          </button>
        )}
      </div>
    </div>
  );
}

const REFUSAL_KEY = {
  'not-understood': 'explore.chat.notUnderstood',
  'no-data': 'explore.chat.noData',
  empty: 'explore.chat.empty',
} as const;

function Answer({
  m,
  onUndo,
  onApply,
  onRecords,
}: {
  m: Extract<Msg, { who: 'ai' }>;
  onUndo: () => void;
  onApply: (label: string, q: WorkbookQuery) => void;
  onRecords: () => void;
}) {
  const t = useT();
  const r = m.r;
  // One term marked once per reply, across its sentences (W26).
  const seen = new Set<string>();
  const coded = r.refusal && r.refusal in REFUSAL_KEY ? REFUSAL_KEY[r.refusal as keyof typeof REFUSAL_KEY] : null;
  const unclassified = r.coverage?.unclassified;
  return (
    <div className="msg-ai" data-testid="chat-answer" lang={r.lang === 'bcl' ? 'bcl' : r.lang === 'fil' ? 'fil' : 'en'}>
      {r.sentences.map((s, i) => (
        <p key={i}>
          <Glossed pieces={gloss(s, seen)} />
        </p>
      ))}
      {r.askBack && (
        <p>
          <Glossed pieces={gloss(r.askBack.question, seen)} />
        </p>
      )}
      {r.refusal && <p className={coded ? 'msg-err' : undefined}>{coded ? t(coded) : r.refusal}</p>}
      {r.lang !== 'en' && (r.sentences.length > 0 || r.askBack) && <p className="machine">{t('explore.chat.machine')}</p>}

      {r.coverage && (
        <ul className="coverage" data-testid="chat-coverage">
          {r.coverage.byLabels && <li>{t('explore.chat.counted')}</li>}
          {unclassified && <li>{t('explore.chat.unclassified', { count: unclassified.count.toLocaleString('en-PH'), amount: formatValue(unclassified.amount, 'money') })}</li>}
          {r.coverage.byLabels && <li>{t('explore.chat.review')}</li>}
          {r.coverage.draft && <li>{t('explore.chat.draft')}</li>}
        </ul>
      )}

      {m.changed && <Applied changed={m.changed} onUndo={onUndo} />}

      {r.ppas && r.ppas.items.length > 0 && (
        <div className="ppas" data-testid="chat-ppas">
          <div className="ppas-h">{t('explore.chat.ppas')}</div>
          <ol>
            {r.ppas.items.map((p, i) => (
              <li key={p.id ?? i}>
                <span className="ppa-name">
                  {p.href ? (
                    <a href={p.href} target="_blank" rel="noopener noreferrer">
                      {p.name}
                      <span className="sr">{t('explore.chat.newTab')}</span>
                    </a>
                  ) : (
                    p.name
                  )}
                  {p.office && <small>{p.office}</small>}
                </span>
                <span className="ppa-amt">{p.amount ? formatValue(p.amount, 'money') : '—'}</span>
              </li>
            ))}
          </ol>
          {r.ppas.total > r.ppas.items.length && (
            <button type="button" className="linkbtn" onClick={onRecords} data-testid="chat-see-all">
              {t('explore.chat.seeAll', { n: r.ppas.total.toLocaleString('en-PH') })}
            </button>
          )}
        </div>
      )}

      {(r.steps.length > 0 || r.alternatives.length > 0 || (r.askBack?.options.length ?? 0) > 0) && (
        <div className="suggest">
          {r.askBack?.options.map((o, i) => (
            <button key={`a${i}`} type="button" onClick={() => onApply(o.label, o.query)}>
              {o.label}
            </button>
          ))}
          {r.steps.map((s) => (
            <button key={s.id} type="button" onClick={() => onApply(t(`explore.chat.step.${s.id}`), s.query)}>
              {t(`explore.chat.step.${s.id}`)}
            </button>
          ))}
          {r.alternatives.map((a, i) => (
            <button key={`o${i}`} type="button" className="alt" onClick={() => onApply(a.label || t('explore.chat.wider'), a.query)}>
              {a.label || t('explore.chat.wider')}
            </button>
          ))}
        </div>
      )}
      {r.recordId && r.answeredBy !== 'resting' && <ExplainFeedback key={r.recordId} recordId={r.recordId} question="explore.ask.feedback" />}
    </div>
  );
}

const TIP_WIDTH = 280;

/** A sentence with its budget terms marked: the definition shows on hover, tap or focus (W6). */
// Pieces come from the reply, not from here: a hover re-renders this alone, and marking
// again against the reply's filled `seen` would unmark the very term being hovered.
function Glossed({ pieces }: { pieces: ReturnType<typeof gloss> }) {
  const base = useId();
  // Fixed to the window, not the chat: the chat scrolls, and a scroll box clips
  // anything absolutely placed inside it (the hint was cut at the column's edge).
  const [tip, setTip] = useState<{ i: number; style: CSSProperties } | null>(null);
  const show = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = Math.min(TIP_WIDTH, innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    // Above the term, or below it when the term sits near the top of the window.
    const style: CSSProperties =
      r.top > 140
        ? { left, width: w, bottom: innerHeight - r.top + 6 }
        : { left, width: w, top: r.bottom + 6 };
    setTip({ i, style });
  };
  return (
    <>
      {pieces.map((p, i) =>
        p.entry ? (
          <span
            key={i}
            className="term"
            tabIndex={0}
            aria-describedby={`${base}-${i}`}
            onMouseEnter={(e) => show(i, e.currentTarget)}
            onFocus={(e) => show(i, e.currentTarget)}
            onMouseLeave={() => setTip(null)}
            onBlur={() => setTip(null)}
            onKeyDown={(e) => e.key === 'Escape' && setTip(null)}
          >
            {p.text}
            <span
              role="tooltip"
              id={`${base}-${i}`}
              className="term-tip"
              hidden={tip?.i !== i}
              style={tip?.i === i ? tip.style : undefined}
            >
              <b>{p.entry.term}</b> {p.entry.definition}
            </span>
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
