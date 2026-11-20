/**
 * A chat model that answers in JSON (specs/018 R1, R20). Any OpenAI-compatible
 * endpoint satisfies it — Azure AI Foundry today, an open model later — so
 * nothing above this port names a vendor.
 */
export const LLM_PORT = Symbol('LLM_PORT');

export interface LlmRequest {
  system: string;
  user: string;
  /** Strict JSON schema the answer must match (`response_format: json_schema`). */
  schema: { name: string; schema: Record<string, unknown> };
  /** Sent for providers that honour it; determinism comes from cache + validator. */
  seed?: number;
}

export interface LlmResult {
  text: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
}

export interface LlmPort {
  /** The model name recorded in the log; `''` when no model is configured. */
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}
