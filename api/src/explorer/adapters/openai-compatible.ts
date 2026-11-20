import type { TokenCredential } from '@azure/identity';
import type { EmbedPort } from '../ports/embed.port.js';
import type { LlmPort, LlmRequest, LlmResult } from '../ports/llm.port.js';

const AZURE_SCOPE = 'https://cognitiveservices.azure.com/.default';
// The labelling run sends 20 rows a call and may need longer (LLM_TIMEOUT_MS).
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 30_000;
const EMBED_BATCH = 256;

let credential: TokenCredential | undefined;

/** `entra`: an Azure token (managed identity or `az login`); `key`: `api-key` on Azure hosts, else a bearer. */
async function authHeaders(
  baseUrl: string,
  auth: string,
  key: string,
): Promise<Record<string, string>> {
  if (auth === 'entra') {
    if (!credential) {
      const { DefaultAzureCredential } = await import('@azure/identity');
      credential = new DefaultAzureCredential();
    }
    const token = await credential.getToken(AZURE_SCOPE);
    if (!token) throw new Error('No Azure token for the model endpoint.');
    return { authorization: `Bearer ${token.token}` };
  }
  return new URL(baseUrl).hostname.endsWith('.azure.com')
    ? { 'api-key': key }
    : { authorization: `Bearer ${key}` };
}

/**
 * `POST ${LLM_BASE_URL}/chat/completions` with a strict JSON schema,
 * temperature 0 and a fixed seed (design §5). Auth is `LLM_AUTH=entra` (an
 * Azure token from the managed identity or `az login`, the way the
 * Azure AI Foundry endpoint is reached) or `key` (`LLM_API_KEY`:
 * the `api-key` header on Azure hosts, a bearer token everywhere else).
 *
 * Registered with a factory in `explorer.module.ts`; `fetchFn` is for tests.
 */
export class OpenAiCompatibleLlm implements LlmPort {
  readonly model: string;
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    /** specs/020 B3.1: another endpoint than LLM_* (the Stride API); default the env. */
    private readonly endpoint?: {
      baseUrl: string;
      model: string;
      headers: Record<string, string>;
    },
  ) {
    this.model = endpoint?.model ?? process.env.LLM_MODEL ?? '';
  }

  private headers(baseUrl: string): Promise<Record<string, string>> {
    if (this.endpoint) return Promise.resolve(this.endpoint.headers);
    return authHeaders(
      baseUrl,
      process.env.LLM_AUTH ?? 'key',
      process.env.LLM_API_KEY ?? '',
    );
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const baseUrl = this.endpoint?.baseUrl ?? process.env.LLM_BASE_URL;
    if (!baseUrl || !this.model)
      throw new Error('LLM_BASE_URL / LLM_MODEL unset.');
    const started = Date.now();
    const res = await this.fetchFn(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await this.headers(baseUrl)),
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          seed: req.seed ?? 0,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { ...req.schema, strict: true },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok)
      throw new Error(
        `Model endpoint answered ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    const body = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      model: body.model ?? this.model,
      latencyMs: Date.now() - started,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
    };
  }
}

/**
 * `POST ${EMBED_BASE_URL}/embeddings` (redesign W16). Falls back to the chat
 * model's endpoint and auth, so on Foundry only `EMBED_MODEL` is needed; a
 * self-hosted embedding server sets its own `EMBED_BASE_URL` / `EMBED_AUTH`.
 */
export class OpenAiCompatibleEmbedder implements EmbedPort {
  readonly model: string;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    /** specs/020 B3.1: the sidecar or the Stride API (same `/embeddings` shape); default the env. */
    private readonly endpoint?: {
      baseUrl: string;
      model: string;
      headers: Record<string, string>;
    },
  ) {
    this.model = endpoint?.model ?? process.env.EMBED_MODEL ?? '';
  }

  async embed(
    texts: string[],
    kind: 'query' | 'passage' = 'passage',
  ): Promise<number[][]> {
    const baseUrl =
      this.endpoint?.baseUrl ||
      process.env.EMBED_BASE_URL ||
      process.env.LLM_BASE_URL;
    if (!baseUrl || !this.model)
      throw new Error('EMBED_MODEL / a base URL unset.');
    const headers =
      this.endpoint?.headers ??
      (await authHeaders(
        baseUrl,
        process.env.EMBED_AUTH || process.env.LLM_AUTH || 'key',
        process.env.EMBED_API_KEY || process.env.LLM_API_KEY || '',
      ));
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const res = await this.fetchFn(
        `${baseUrl.replace(/\/$/, '')}/embeddings`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            model: this.model,
            input: texts.slice(i, i + EMBED_BATCH),
            // The sidecar's E5 models want query/passage prefixes; OpenAI ignores the field.
            ...(this.endpoint ? { input_type: kind } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok)
        throw new Error(
          `Embedding endpoint answered ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      const body = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };
      out.push(
        ...[...body.data]
          .sort((a, b) => a.index - b.index)
          .map((d) => unit(d.embedding)),
      );
    }
    return out;
  }
}

/** Scaled to length 1, so a dot product is the cosine (a self-hosted model may not normalise). */
function unit(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
