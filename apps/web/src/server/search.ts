import { createEmbeddingClient } from "@stancehub/ai";
import {
  searchChunksByKeyword,
  searchChunksByVector,
  type SearchHit,
} from "@stancehub/db";
import { getServerEnv } from "@/env";
import { getDb } from "@/server/db";

export type VaultSearchResult = {
  keyword: SearchHit[];
  vector: SearchHit[];
  vectorError: string | null;
};

export async function searchVault(input: {
  organizationId: string;
  query: string;
  limit?: number;
  mode?: "keyword" | "vector" | "both";
}): Promise<VaultSearchResult> {
  const query = input.query.trim();
  const limit = input.limit ?? 8;
  const mode = input.mode ?? "both";
  if (!query) return { keyword: [], vector: [], vectorError: null };

  const db = getDb();
  const keyword =
    mode === "vector"
      ? []
      : await searchChunksByKeyword(db, { organizationId: input.organizationId, query, limit });

  if (mode === "keyword") return { keyword, vector: [], vectorError: null };

  try {
    const env = getServerEnv();
    if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.EMBEDDING_MODEL) {
      throw new Error("embedding endpoint is not configured");
    }
    const client = createEmbeddingClient({
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.EMBEDDING_MODEL,
    });
    const [embedding] = await client.embed([query]);
    if (!embedding) throw new Error("empty embedding");
    const vector = await searchChunksByVector(db, {
      organizationId: input.organizationId,
      embedding,
      limit,
    });
    return { keyword, vector, vectorError: null };
  } catch (error) {
    return {
      keyword,
      vector: [],
      vectorError: error instanceof Error ? error.message : "vector search failed",
    };
  }
}
