/**
 * Enterprise-style endpoint profiles: embeddings (retrieval) and chat (generation)
 * are resolved independently. Shared LLM_* values remain migration fallbacks only.
 */

export type EmbeddingEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
};

export type ChatEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

function trim(value: string | undefined) {
  const next = value?.trim();
  return next ? next : undefined;
}

function positiveInt(value: string | undefined, fallback: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

/**
 * Resolve vault embedding endpoint.
 * Precedence: EMBEDDING_BASE_URL → LLM_BASE_URL; EMBEDDING_API_KEY → LLM_API_KEY.
 */
export function resolveEmbeddingEndpoint(
  env: Record<string, string | undefined>,
  defaults?: { dimensions?: number },
): EmbeddingEndpoint {
  const baseUrl = trim(env.EMBEDDING_BASE_URL) ?? trim(env.LLM_BASE_URL);
  const apiKey = trim(env.EMBEDDING_API_KEY) ?? trim(env.LLM_API_KEY);
  const model = trim(env.EMBEDDING_MODEL);
  const dimensions = positiveInt(env.EMBEDDING_DIMENSIONS, defaults?.dimensions ?? 768);
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "Embedding endpoint requires EMBEDDING_MODEL and (EMBEDDING_BASE_URL or LLM_BASE_URL) and (EMBEDDING_API_KEY or LLM_API_KEY)",
    );
  }
  return { baseUrl, apiKey, model, dimensions };
}

/**
 * Resolve generative chat endpoint (summarize / ask).
 * Precedence:
 *   URL: CHAT_BASE_URL → LLM_BASE_URL
 *   Key: CHAT_API_KEY → OLLAMA_API_KEY → LLM_API_KEY
 *   Model: LLM_MODEL (required; chat-only)
 *   Timeout: CHAT_TIMEOUT_MS → LLM_CHAT_TIMEOUT_MS → 120000
 */
export function resolveChatEndpoint(env: Record<string, string | undefined>): ChatEndpoint {
  const baseUrl = trim(env.CHAT_BASE_URL) ?? trim(env.LLM_BASE_URL);
  const apiKey =
    trim(env.CHAT_API_KEY) ?? trim(env.OLLAMA_API_KEY) ?? trim(env.LLM_API_KEY);
  const model = trim(env.LLM_MODEL);
  const timeoutMs = positiveInt(
    trim(env.CHAT_TIMEOUT_MS) ?? trim(env.LLM_CHAT_TIMEOUT_MS),
    120_000,
  );
  if (timeoutMs < 1000) {
    throw new Error("Chat timeout must be at least 1000ms");
  }
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "Chat endpoint requires LLM_MODEL and (CHAT_BASE_URL or LLM_BASE_URL) and (CHAT_API_KEY or OLLAMA_API_KEY or LLM_API_KEY)",
    );
  }
  return { baseUrl, apiKey, model, timeoutMs };
}
