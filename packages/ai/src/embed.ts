export type EmbeddingRequest = {
  url: string;
  body: { model: string; input: string[]; dimensions?: number };
};

export function buildEmbeddingRequest(opts: {
  baseUrl: string;
  model: string;
  input: string[];
  dimensions?: number;
}): EmbeddingRequest {
  const base = opts.baseUrl.replace(/\/$/, "");
  const body: EmbeddingRequest["body"] = { model: opts.model, input: opts.input };
  if (opts.dimensions != null) body.dimensions = opts.dimensions;
  return {
    url: `${base}/embeddings`,
    body,
  };
}

export type EmbeddingClient = {
  embed(texts: string[]): Promise<number[][]>;
};

const DEFAULT_EMBED_TIMEOUT_MS = 30_000;

export function createEmbeddingClient(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): EmbeddingClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_EMBED_TIMEOUT_MS;
  return {
    async embed(texts: string[]) {
      if (texts.length === 0) return [];
      const request = buildEmbeddingRequest({
        baseUrl: opts.baseUrl,
        model: opts.model,
        input: texts,
        dimensions: opts.dimensions,
      });
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Embedding request failed (${response.status}): ${detail.slice(0, 300)}`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ index: number; embedding: number[] }>;
      };
      const rows = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
      if (rows.length !== texts.length) {
        throw new Error(`Embedding response count ${rows.length} != input ${texts.length}`);
      }
      return rows.map((row) => row.embedding);
    },
  };
}

export function createLlmClient(opts: {
  baseUrl: string;
  apiKey: string;
  model?: string;
  dimensions?: number;
}) {
  const embeddings = createEmbeddingClient({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model ?? "",
    dimensions: opts.dimensions,
  });
  return {
    embed(texts: string[]) {
      if (!opts.model) throw new Error("EMBEDDING_MODEL is required");
      return embeddings.embed(texts);
    },
    async chat(_messages: { role: string; content: string }[]): Promise<string> {
      throw new Error("Chat is not implemented in this sprint");
    },
  };
}
