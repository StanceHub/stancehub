import { DEFAULT_CHUNK_MAX_CHARS } from "@stancehub/ai";

const MIN_CHUNK_MAX_CHARS = 120;
const MAX_CHUNK_MAX_CHARS = 4000;

export function readChunkMaxChars(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.CHUNK_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_CHUNK_MAX_CHARS;
  if (!/^\d+$/.test(raw)) {
    throw new Error("CHUNK_MAX_CHARS must be a positive integer");
  }
  const value = Number(raw);
  if (value < MIN_CHUNK_MAX_CHARS || value > MAX_CHUNK_MAX_CHARS) {
    throw new Error(`CHUNK_MAX_CHARS must be between ${MIN_CHUNK_MAX_CHARS} and ${MAX_CHUNK_MAX_CHARS}`);
  }
  return value;
}

export function readEmbeddingConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.EMBEDDING_MODEL?.trim();
  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? "768");
  const chunkMaxChars = readChunkMaxChars(env);
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, and EMBEDDING_MODEL are required");
  }
  if (!Number.isFinite(dimensions) || dimensions < 1) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive number");
  }
  return { baseUrl, apiKey, model, dimensions, chunkMaxChars };
}
