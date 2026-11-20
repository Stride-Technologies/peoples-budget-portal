/**
 * One inference port, three backends (specs/020 B3.1, decision 2).
 *
 * Capabilities: `complete` (a chat model answering in JSON: `LlmPort`),
 * `embed` (`EmbedPort`) and `decide` (typed decisions: choice, yes/no, score,
 * with probabilities: `TypedDecisionPort`). Each picks its backend:
 *
 *   EXPLORER_INFERENCE=openai|sidecar|stride          all capabilities (default openai)
 *   EXPLORER_INFERENCE_{COMPLETE,EMBED,DECIDE}=…      one capability
 *
 * - `openai`: any OpenAI-compatible endpoint (`LLM_*`, `EMBED_*`), as before.
 * - `sidecar`: `services/inference` on the private network (`SIDECAR_URL`):
 *   LAYA decisions and open embeddings, no chat model on CPU.
 * - `stride`: Stride's hosted sidecar (`STRIDE_API_URL`, `STRIDE_API_KEY`),
 *   the same HTTP contract behind a bearer key, allowed only where the LGU
 *   opted in (`EXPLORER_STRIDE_OPT_IN=1`, decision 4).
 *
 * The contract is `docs/modules/inference-sidecar.md`. Budget text goes to
 * whichever backend is chosen; personal data never does (AGENTS.md).
 */
export const TYPED_DECISION_PORT = Symbol('TYPED_DECISION_PORT');

export const CAPABILITIES = ['complete', 'embed', 'decide'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const BACKENDS = ['openai', 'sidecar', 'stride'] as const;
export type Backend = (typeof BACKENDS)[number];

export interface TypedQuestion {
  type: 'choice' | 'noul' | 'score';
  /** The whole judgment in words: question ids are never sent as meaning. */
  instructions: string;
  /** choice: option → meaning; score: level → meaning, low to high. */
  criteria?: Record<string, string>;
}

export interface TypedAnswer {
  type: TypedQuestion['type'];
  choice?: string | null;
  probabilities?: Record<string, number> | null;
  /** noul: P(yes). */
  p?: number | null;
  score?: number | null;
  confidence?: number | null;
}

export interface TypedDecisions {
  model: string;
  answers: Record<string, TypedAnswer>;
  latencyMs: number;
}

export interface TypedDecisionPort {
  readonly model: string;
  decide(
    state: Record<string, unknown> | string,
    questions: Record<string, TypedQuestion>,
  ): Promise<TypedDecisions>;
}

/** Which backend serves a capability; refuses what a backend cannot do or may not be used for. */
export function backendFor(
  cap: Capability,
  env: NodeJS.ProcessEnv = process.env,
): Backend {
  const own = env[`EXPLORER_INFERENCE_${cap.toUpperCase()}`];
  // A global `sidecar` means "what the sidecar serves": chat stays on openai.
  const raw =
    own ||
    (cap === 'complete' && env.EXPLORER_INFERENCE === 'sidecar'
      ? 'openai'
      : env.EXPLORER_INFERENCE) ||
    'openai';
  if (!(BACKENDS as readonly string[]).includes(raw))
    throw new Error(
      `EXPLORER_INFERENCE${own ? `_${cap.toUpperCase()}` : ''}=${raw}: use ${BACKENDS.join(' | ')}.`,
    );
  const b = raw as Backend;
  if (b === 'stride' && env.EXPLORER_STRIDE_OPT_IN !== '1')
    throw new Error(
      'The Stride inference API is opt-in per LGU: set EXPLORER_STRIDE_OPT_IN=1 where the LGU agreed (specs/020 decision 4).',
    );
  if (b === 'sidecar' && cap === 'complete')
    throw new Error(
      'The CPU sidecar has no chat model: EXPLORER_INFERENCE_COMPLETE must be openai or stride.',
    );
  if (b === 'openai' && cap === 'decide')
    throw new Error(
      'Typed decisions come from the sidecar or the Stride API: EXPLORER_INFERENCE_DECIDE=sidecar|stride.',
    );
  return b;
}

/** Base URL and auth for the sidecar contract (sidecar or stride). */
export function sidecarEndpoint(
  b: Exclude<Backend, 'openai'>,
  env: NodeJS.ProcessEnv = process.env,
): { baseUrl: string; headers: Record<string, string> } {
  const baseUrl =
    b === 'stride'
      ? env.STRIDE_API_URL
      : env.SIDECAR_URL || 'http://inference:8100';
  const key = b === 'stride' ? env.STRIDE_API_KEY : env.SIDECAR_API_KEY;
  if (!baseUrl) throw new Error('STRIDE_API_URL unset.');
  // The bearer key never travels in clear text.
  if (b === 'stride' && !baseUrl.startsWith('https://'))
    throw new Error('STRIDE_API_URL must be https.');
  if (b === 'stride' && !key) throw new Error('STRIDE_API_KEY unset.');
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    headers: key ? { authorization: `Bearer ${key}` } : {},
  };
}
