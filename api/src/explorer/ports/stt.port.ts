import type { Lang } from '../catalogue.service.js';

export const STT_PORT = Symbol('STT_PORT');

/**
 * Speech to text (specs/018 P4, design §6). One short clip in, the words out.
 * A provider never stores the clip; neither does the API (it lives in memory
 * for the length of the request and is not logged).
 */
export interface SttPort {
  /** `omnilingual` | `azure`, returned to the client as `by`. */
  readonly name: string;
  /** The page languages it can hear; the mic is offered only for these. */
  readonly languages: Lang[];
  transcribe(audio: Buffer, mimeType: string, lang: Lang): Promise<string>;
}
