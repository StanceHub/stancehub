import { createEmbeddingClient, resolveEmbeddingEndpoint } from "@stancehub/ai";
import {
  reciprocalRankFusion,
  retrievalPoolSize,
  SEARCH_STATEMENT_TIMEOUT_MS,
  searchChunksByKeyword,
  searchChunksByVector,
  type SearchHit,
} from "@stancehub/db";
import { getProcessEnvRecord } from "@/env";
import { getDb } from "@/server/db";

export const SEARCH_VECTOR_TIMEOUT_MS = 8000;

export type VaultSearchResult = {
  fused: SearchHit[];
  keyword: SearchHit[];
  vector: SearchHit[];
  keywordError: string | null;
  vectorError: string | null;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function fuseAvailableLists(keyword: SearchHit[], vector: SearchHit[], limit: number) {
  if (keyword.length > 0 && vector.length > 0) {
    return reciprocalRankFusion([keyword, vector], { limit });
  }
  if (keyword.length > 0) return keyword.slice(0, limit);
  return vector.slice(0, limit);
}

function logSearchMetrics(fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ event: "vault.search", ...fields }));
}

export async function searchVault(input: {
  organizationId: string;
  query: string;
  limit?: number;
  mode?: "keyword" | "vector" | "both";
}): Promise<VaultSearchResult> {
  const started = performance.now();
  const query = input.query.trim();
  const requestedLimit = input.limit ?? 8;
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(50, Math.floor(requestedLimit)) : 8;
  const mode = input.mode ?? "both";
  if (!query) {
    return { fused: [], keyword: [], vector: [], keywordError: null, vectorError: null };
  }

  const db = getDb();
  const pool = retrievalPoolSize(limit);
  let keyword: SearchHit[] = [];
  let keywordError: string | null = null;
  let keywordMs = 0;
  if (mode !== "vector") {
    const keywordStarted = performance.now();
    try {
      keyword = await searchChunksByKeyword(db, {
        organizationId: input.organizationId,
        query,
        limit: pool,
        statementTimeoutMs: SEARCH_STATEMENT_TIMEOUT_MS,
      });
    } catch (error) {
      keywordError = errorMessage(error, "keyword search failed");
      if (mode === "keyword") {
        logSearchMetrics({
          organizationId: input.organizationId,
          mode,
          queryLength: query.length,
          keywordCount: 0,
          vectorCount: 0,
          fusedCount: 0,
          keywordMs: Math.round(performance.now() - keywordStarted),
          vectorMs: 0,
          totalMs: Math.round(performance.now() - started),
          keywordError: true,
          vectorError: false,
        });
        throw error;
      }
    } finally {
      keywordMs = Math.round(performance.now() - keywordStarted);
    }
  }

  if (mode === "keyword") {
    const keywordHits = keyword.slice(0, limit);
    logSearchMetrics({
      organizationId: input.organizationId,
      mode,
      queryLength: query.length,
      keywordCount: keywordHits.length,
      vectorCount: 0,
      fusedCount: keywordHits.length,
      keywordMs,
      vectorMs: 0,
      totalMs: Math.round(performance.now() - started),
      keywordError: Boolean(keywordError),
      vectorError: false,
    });
    return { fused: keywordHits, keyword: keywordHits, vector: [], keywordError, vectorError: null };
  }

  const vectorStarted = performance.now();
  try {
    const embeddingEndpoint = resolveEmbeddingEndpoint(getProcessEnvRecord());
    const client = createEmbeddingClient({
      baseUrl: embeddingEndpoint.baseUrl,
      apiKey: embeddingEndpoint.apiKey,
      model: embeddingEndpoint.model,
      dimensions: embeddingEndpoint.dimensions,
      timeoutMs: SEARCH_VECTOR_TIMEOUT_MS,
    });
    const [embedding] = await client.embed([query]);
    if (!embedding) throw new Error("empty embedding");
    const vector = await searchChunksByVector(db, {
      organizationId: input.organizationId,
      embedding,
      limit: pool,
    });
    if (keywordError && vector.length === 0) throw new Error(keywordError);
    const fused = fuseAvailableLists(keyword, vector, limit);
    const vectorMs = Math.round(performance.now() - vectorStarted);
    logSearchMetrics({
      organizationId: input.organizationId,
      mode,
      queryLength: query.length,
      keywordCount: keyword.slice(0, limit).length,
      vectorCount: vector.slice(0, limit).length,
      fusedCount: fused.length,
      keywordMs,
      vectorMs,
      totalMs: Math.round(performance.now() - started),
      keywordError: Boolean(keywordError),
      vectorError: false,
    });
    return {
      fused,
      keyword: keyword.slice(0, limit),
      vector: vector.slice(0, limit),
      keywordError,
      vectorError: null,
    };
  } catch (error) {
    const vectorMs = Math.round(performance.now() - vectorStarted);
    if (keywordError) {
      const vectorMessage = errorMessage(error, "vector search failed");
      logSearchMetrics({
        organizationId: input.organizationId,
        mode,
        queryLength: query.length,
        keywordCount: 0,
        vectorCount: 0,
        fusedCount: 0,
        keywordMs,
        vectorMs,
        totalMs: Math.round(performance.now() - started),
        keywordError: true,
        vectorError: true,
      });
      throw new Error(vectorMessage === keywordError ? keywordError : `${keywordError}; ${vectorMessage}`);
    }
    const keywordHits = keyword.slice(0, limit);
    logSearchMetrics({
      organizationId: input.organizationId,
      mode,
      queryLength: query.length,
      keywordCount: keywordHits.length,
      vectorCount: 0,
      fusedCount: keywordHits.length,
      keywordMs,
      vectorMs,
      totalMs: Math.round(performance.now() - started),
      keywordError: false,
      vectorError: true,
    });
    return {
      fused: keywordHits,
      keyword: keywordHits,
      vector: [],
      keywordError: null,
      vectorError: errorMessage(error, "vector search failed"),
    };
  }
}
