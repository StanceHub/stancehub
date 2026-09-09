import { resolveEmbeddingEndpoint } from "@stancehub/ai";
import { DEFAULT_EMBEDDING_DIMENSIONS } from "@stancehub/db";
import { readChunkMaxChars } from "./chunk-config";

export { readChunkMaxChars } from "./chunk-config";

export function readEmbeddingConfig(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = resolveEmbeddingEndpoint(env as Record<string, string | undefined>, {
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
  });
  if (endpoint.dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `EMBEDDING_DIMENSIONS must be ${DEFAULT_EMBEDDING_DIMENSIONS} (schema vector width); got ${endpoint.dimensions}`,
    );
  }
  return {
    ...endpoint,
    chunkMaxChars: readChunkMaxChars(env),
  };
}
