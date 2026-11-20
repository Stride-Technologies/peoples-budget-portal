/**
 * Text → vector (specs/018 redesign W16), for matching a question's words to
 * catalogue labels and topics. Any OpenAI-compatible `/embeddings` endpoint;
 * `null` when no embedding model is configured (matching is then by alias only).
 */
export const EMBED_PORT = Symbol('EMBED_PORT');

export interface EmbedPort {
  readonly model: string;
  /**
   * One unit-length vector per text, in order. `kind` matters to models
   * trained with query/passage prefixes (E5); a question is a `query`.
   */
  embed(texts: string[], kind?: 'query' | 'passage'): Promise<number[][]>;
}
