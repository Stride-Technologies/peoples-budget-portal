import type { Lang } from '../catalogue.service.js';
import type { SttPort } from '../ports/stt.port.js';

const TIMEOUT_MS = 20_000;

const post = async (fetchFn: typeof fetch, url: string, init: RequestInit) => {
  const res = await fetchFn(url, {
    ...init,
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Speech service answered ${res.status}.`);
  return res.json() as Promise<unknown>;
};

/**
 * Meta Omnilingual ASR behind the `explorer-stt` container:
 * `POST ${STT_BASE_URL}/transcribe`, multipart `audio` + `lang` → `{ text }`.
 * The container decodes with ffmpeg, runs `STT_MODEL` (spike: CTC 300M) and
 * applies the hearings `clean()` + glossary fold. It hears all three languages.
 */
export class OmnilingualStt implements SttPort {
  readonly name = 'omnilingual';
  readonly languages: Lang[] = ['en', 'fil', 'bcl'];

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async transcribe(
    audio: Buffer,
    mimeType: string,
    lang: Lang,
  ): Promise<string> {
    const base = process.env.STT_BASE_URL;
    if (!base) throw new Error('STT_BASE_URL unset.');
    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      'clip',
    );
    form.append('lang', lang);
    const key = process.env.STT_API_KEY;
    const body = (await post(
      this.fetchFn,
      `${base.replace(/\/$/, '')}/transcribe`,
      {
        body: form,
        headers: key ? { authorization: `Bearer ${key}` } : {},
      },
    )) as { text?: string };
    return (body.text ?? '').trim();
  }
}

/** Azure AI Speech fast transcription. English and Filipino only: Azure has no Bikol. */
export class AzureSpeechStt implements SttPort {
  readonly name = 'azure';
  readonly languages: Lang[] = ['en', 'fil'];

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async transcribe(
    audio: Buffer,
    mimeType: string,
    lang: Lang,
  ): Promise<string> {
    const region = process.env.AZURE_SPEECH_REGION;
    const key = process.env.AZURE_SPEECH_KEY;
    if (!region || !key)
      throw new Error('AZURE_SPEECH_REGION / AZURE_SPEECH_KEY unset.');
    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      'clip',
    );
    // ponytail: no phrase list yet; feed the catalogue aliases in when the Filipino misses show it is needed.
    form.append(
      'definition',
      JSON.stringify({ locales: [lang === 'fil' ? 'fil-PH' : 'en-PH'] }),
    );
    const body = (await post(
      this.fetchFn,
      `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`,
      { body: form, headers: { 'Ocp-Apim-Subscription-Key': key } },
    )) as { combinedPhrases?: { text?: string }[] };
    return (body.combinedPhrases ?? [])
      .map((p) => p.text ?? '')
      .join(' ')
      .trim();
  }
}

/** `STT_PROVIDER`: `omnilingual` | `azure`; anything else is no mic. */
export function sttFromEnv(fetchFn: typeof fetch = fetch): SttPort | null {
  switch (process.env.STT_PROVIDER) {
    case 'omnilingual':
      return new OmnilingualStt(fetchFn);
    case 'azure':
      return new AzureSpeechStt(fetchFn);
    default:
      return null;
  }
}
