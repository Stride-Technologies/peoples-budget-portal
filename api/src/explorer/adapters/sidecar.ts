import {
  backendFor,
  sidecarEndpoint,
  type TypedDecisionPort,
  type TypedDecisions,
  type TypedQuestion,
} from '../ports/inference.port.js';
import type { EmbedPort } from '../ports/embed.port.js';
import type { LlmPort } from '../ports/llm.port.js';
import {
  OpenAiCompatibleEmbedder,
  OpenAiCompatibleLlm,
} from './openai-compatible.js';

const TIMEOUT_MS = Number(process.env.SIDECAR_TIMEOUT_MS) || 30_000;

/** `POST /v1/decide` on the sidecar contract (sidecar or Stride API). */
export class SidecarDecider implements TypedDecisionPort {
  readonly model: string;
  constructor(
    private readonly endpoint: {
      baseUrl: string;
      headers: Record<string, string>;
      model?: string;
    },
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.model = endpoint.model ?? 'laya';
  }

  async decide(
    state: Record<string, unknown> | string,
    questions: Record<string, TypedQuestion>,
  ): Promise<TypedDecisions> {
    const started = Date.now();
    const res = await this.fetchFn(`${this.endpoint.baseUrl}/v1/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.endpoint.headers },
      body: JSON.stringify({ state, questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Status only: a 422 or a proxy page can echo the request, which may be a resident's question.
    if (!res.ok) throw new Error(`Decision endpoint answered ${res.status}.`);
    const body = (await res.json()) as {
      model?: string;
      answers?: TypedDecisions['answers'];
    };
    const answers = body.answers ?? {};
    const missing = Object.keys(questions).filter((k) => !answers[k]);
    if (missing.length)
      throw new Error(`Decision endpoint skipped ${missing.join(', ')}.`);
    return {
      model: body.model ?? this.model,
      answers,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * The three capabilities from the environment (specs/020 B3.1). `embed` and
 * `decide` are null when nothing serves them (no EMBED_MODEL; decide not
 * configured), as before; a misconfiguration throws at startup, not mid-request.
 */
export function inferenceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): {
  llm: LlmPort;
  embedder: EmbedPort | null;
  decider: TypedDecisionPort | null;
} {
  const complete = backendFor('complete', env);
  const llm =
    complete === 'stride'
      ? new OpenAiCompatibleLlm(fetchFn, {
          ...sidecarEndpoint('stride', env),
          baseUrl: `${sidecarEndpoint('stride', env).baseUrl}/v1`,
          model: env.LLM_MODEL ?? '',
        })
      : new OpenAiCompatibleLlm(fetchFn);
  const embed = backendFor('embed', env);
  const embedder = !env.EMBED_MODEL
    ? null
    : embed === 'openai'
      ? new OpenAiCompatibleEmbedder(fetchFn)
      : new OpenAiCompatibleEmbedder(fetchFn, {
          ...sidecarEndpoint(embed, env),
          baseUrl: `${sidecarEndpoint(embed, env).baseUrl}/v1`,
          model: env.EMBED_MODEL,
        });
  const wantsDecide =
    !!env.EXPLORER_INFERENCE_DECIDE ||
    (!!env.EXPLORER_INFERENCE && env.EXPLORER_INFERENCE !== 'openai');
  const decide = wantsDecide ? backendFor('decide', env) : null;
  const decider =
    decide && decide !== 'openai'
      ? new SidecarDecider(
          { ...sidecarEndpoint(decide, env), model: env.DECIDE_MODEL },
          fetchFn,
        )
      : null;
  return { llm, embedder, decider };
}
