export function readEmbeddingConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.EMBEDDING_MODEL?.trim();
  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? "768");
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, and EMBEDDING_MODEL are required");
  }
  if (!Number.isFinite(dimensions) || dimensions < 1) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive number");
  }
  return { baseUrl, apiKey, model, dimensions };
}
