'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, Square } from 'lucide-react';
import { transcribeQuestion } from '@/app/(public)/explore/_actions';
import { useLocale, useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import { deviceKey } from '@/lib/explore/device-key';

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'hearing' }
  | { kind: 'heard' }
  | { kind: 'error'; reason: 'denied' | 'empty' | 'limit' | 'failed' };

const noop = () => () => {};
const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

/**
 * Speak a question (specs/018 P4, design §6). Records at most `maxSeconds`
 * with MediaRecorder, sends it through the server to the API's speech service
 * and puts the words in the question box — never asks on its own, so the
 * visitor sees and can fix what was heard first. Rendered only where the
 * browser can record; the page offers it only for languages the service hears.
 * The browser's own SpeechRecognition is deliberately not used: it sends the
 * voice to Google or Apple, which the privacy notice does not cover.
 */
export function MicButton({ maxSeconds, onText }: { maxSeconds: number; onText: (text: string) => void }) {
  const t = useT();
  const lang = useLocale();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // false on the server and during hydration, the browser's answer after: no mismatch.
  const supported = useSyncExternalStore(
    noop,
    () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  useEffect(() => () => stop(), []);

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setState({ kind: 'error', reason: 'denied' });
    }
    const mimeType = TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      setState({ kind: 'hearing' });
      const form = new FormData();
      form.append('audio', new Blob(chunks, { type: rec.mimeType }), 'clip');
      form.append('lang', lang);
      const key = deviceKey();
      if (key) form.append('deviceKey', key);
      const r = await transcribeQuestion(form);
      if ('error' in r) return setState({ kind: 'error', reason: r.error });
      if (!r.text) return setState({ kind: 'error', reason: 'empty' });
      onText(r.text);
      setState({ kind: 'heard' });
    };
    recorder.current = rec;
    rec.start();
    setState({ kind: 'recording', seconds: 0 });
    const began = Date.now();
    timer.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - began) / 1000);
      if (seconds >= maxSeconds) stop();
      else setState({ kind: 'recording', seconds });
    }, 250);
  }

  if (!supported) return null;
  const recording = state.kind === 'recording';
  return (
    <>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={state.kind === 'hearing'}
        aria-pressed={recording}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-rule bg-paper-raised px-4 text-sm font-medium text-ink hover:bg-paper-tint disabled:opacity-50"
      >
        {recording ? <Square aria-hidden="true" className="h-4 w-4" /> : <Mic aria-hidden="true" className="h-4 w-4" />}
        {recording ? t('explore.mic.stop', { seconds: maxSeconds - state.seconds }) : t('explore.mic.speak')}
      </button>
      <p role="status" className="basis-full text-sm text-ink sm:order-last">
        {recording && t('explore.mic.listening')}
        {state.kind === 'hearing' && t('explore.mic.hearing')}
        {state.kind === 'heard' && t('explore.mic.heard')}
        {state.kind === 'error' && t(`explore.mic.error.${state.reason}` as MessageKey)}
      </p>
    </>
  );
}
