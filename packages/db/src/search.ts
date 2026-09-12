import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { chunks, meetings } from "./schema/index";
import { DEFAULT_EMBEDDING_DIMENSIONS } from "./schema/vault";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export const RRF_K = 60;
export const RETRIEVAL_POOL_CAP = 50;
export const BM25_CANDIDATE_CAP = 200;
export const SEARCH_STATEMENT_TIMEOUT_MS = 2000;

export type SearchHit = {
  chunkId: string;
  meetingId: string;
  organizationId: string;
  meetingTitle: string;
  content: string;
  score: number;
  startMs: number | null;
  endMs: number | null;
};

export function retrievalPoolSize(limit: number) {
  const safe = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 8;
  return Math.min(RETRIEVAL_POOL_CAP, Math.max(safe * 4, 20));
}

function clampLimit(limit: number | undefined, fallback = 10) {
  const value = limit ?? fallback;
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(RETRIEVAL_POOL_CAP, Math.floor(value));
}

export function assertEmbedding(embedding: number[], dimensions = DEFAULT_EMBEDDING_DIMENSIONS) {
  if (embedding.length !== dimensions) {
    throw new Error(`Embedding dimension ${embedding.length} does not match ${dimensions}`);
  }
  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding contains a non-finite value");
  }
}

function vectorLiteral(embedding: number[]) {
  assertEmbedding(embedding);
  return `[${embedding.join(",")}]`;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  return [];
}

type RankedChunkRow = {
  chunk_id: string;
  meeting_id: string;
  organization_id: string;
  meeting_title: string;
  content: string;
  start_ms: number | null;
  end_ms: number | null;
  score: string | number | null;
};

function toHit(row: RankedChunkRow): SearchHit {
  return {
    chunkId: row.chunk_id,
    meetingId: row.meeting_id,
    organizationId: row.organization_id,
    meetingTitle: row.meeting_title,
    content: row.content,
    score: Number(row.score),
    startMs: row.start_ms,
    endMs: row.end_ms,
  };
}

export async function searchChunksByKeyword(
  db: Database,
  input: {
    organizationId: string;
    query: string;
    limit?: number;
    statementTimeoutMs?: number;
  },
): Promise<SearchHit[]> {
  const query = input.query.trim();
  if (!query) return [];
  const limit = clampLimit(input.limit);
  const statementTimeoutMs = input.statementTimeoutMs ?? SEARCH_STATEMENT_TIMEOUT_MS;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${String(statementTimeoutMs)}, true)`);

    const result = await tx.execute(sql`
      WITH params AS (
        SELECT
          ${BM25_K1}::float AS k1,
          ${BM25_B}::float AS b,
          ${input.organizationId}::text AS organization_id,
          to_tsvector('english', ${query}) AS query_tsv
      ),
      query_lexemes AS (
        SELECT DISTINCT u.lexeme
        FROM params p
        CROSS JOIN LATERAL unnest(p.query_tsv) AS u(lexeme, positions)
        WHERE u.lexeme ~ '^[a-z0-9]+$'
      ),
      query_or AS (
        SELECT to_tsquery('simple', string_agg(lexeme, ' | ' ORDER BY lexeme)) AS tsq
        FROM query_lexemes
      ),
      org_stats AS (
        SELECT
          s.n_docs::float AS n_docs,
          greatest(s.sum_token_count::float / nullif(s.n_docs::float, 0), 1)::float AS avgdl
        FROM org_search_stats s
        CROSS JOIN params p
        WHERE s.organization_id = p.organization_id
          AND s.n_docs > 0
          AND s.sum_token_count > 0
      ),
      term_stats AS (
        SELECT
          ql.lexeme,
          coalesce(df.n_qi, 0)::float AS n_qi
        FROM query_lexemes ql
        CROSS JOIN params p
        LEFT JOIN org_term_df df
          ON df.organization_id = p.organization_id
          AND df.lexeme = ql.lexeme
      ),
      candidates AS (
        SELECT c.id
        FROM chunks c
        CROSS JOIN params p
        CROSS JOIN query_or q
        WHERE c.organization_id = p.organization_id
          AND q.tsq IS NOT NULL
          AND EXISTS (SELECT 1 FROM org_stats)
          AND c.content_tsv @@ q.tsq
        ORDER BY ts_rank(c.content_tsv, q.tsq) DESC, c.id
        LIMIT ${BM25_CANDIDATE_CAP}::int
      ),
      matched AS (
        SELECT
          c.id,
          c.meeting_id,
          c.organization_id,
          c.content,
          c.start_ms,
          c.end_ms,
          c.content_tsv,
          greatest(c.token_count, 1)::float AS dl,
          m.title AS meeting_title
        FROM candidates cand
        INNER JOIN chunks c ON c.id = cand.id
        INNER JOIN meetings m ON m.id = c.meeting_id AND m.organization_id = c.organization_id
      ),
      scored AS (
        SELECT
          m.id AS chunk_id,
          m.meeting_id,
          m.organization_id,
          m.meeting_title,
          m.content,
          m.start_ms,
          m.end_ms,
          sum(
            ln(1 + (greatest(os.n_docs - ts.n_qi, 0) + 0.5) / (ts.n_qi + 0.5))
            * (freq.tf * (p.k1 + 1))
            / (freq.tf + p.k1 * (1 - p.b + p.b * m.dl / os.avgdl))
          ) AS score
        FROM matched m
        CROSS JOIN params p
        CROSS JOIN org_stats os
        CROSS JOIN LATERAL unnest(m.content_tsv) AS doc_term(lexeme, positions)
        INNER JOIN term_stats ts ON ts.lexeme = doc_term.lexeme
        CROSS JOIN LATERAL (
          SELECT cardinality(doc_term.positions)::float AS tf
        ) AS freq
        WHERE ts.n_qi > 0
        GROUP BY m.id, m.meeting_id, m.organization_id, m.meeting_title, m.content, m.start_ms, m.end_ms
      )
      SELECT chunk_id, meeting_id, organization_id, meeting_title, content, start_ms, end_ms, score
      FROM scored
      WHERE score IS NOT NULL
      ORDER BY score DESC, chunk_id ASC
      LIMIT ${limit}::int
    `);

    return rowsOf<RankedChunkRow>(result)
      .map(toHit)
      .filter((hit) => Number.isFinite(hit.score));
  });
}

export async function searchChunksByVector(
  db: Database,
  input: {
    organizationId: string;
    embedding: number[];
    limit?: number;
    statementTimeoutMs?: number;
  },
): Promise<SearchHit[]> {
  if (input.embedding.length === 0) return [];
  const limit = clampLimit(input.limit);
  const literal = vectorLiteral(input.embedding);
  const statementTimeoutMs = input.statementTimeoutMs ?? SEARCH_STATEMENT_TIMEOUT_MS;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${String(statementTimeoutMs)}, true)`);
    const rows = await tx
      .select({
        chunkId: chunks.id,
        meetingId: chunks.meetingId,
        organizationId: chunks.organizationId,
        meetingTitle: meetings.title,
        content: chunks.content,
        startMs: chunks.startMs,
        endMs: chunks.endMs,
        score: sql<number>`1 - (${chunks.embedding} <=> ${literal}::vector)`,
      })
      .from(chunks)
      .innerJoin(
        meetings,
        and(eq(meetings.id, chunks.meetingId), eq(meetings.organizationId, chunks.organizationId)),
      )
      .where(eq(chunks.organizationId, input.organizationId))
      .orderBy(sql`${chunks.embedding} <=> ${literal}::vector`, chunks.id)
      .limit(limit);

    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  });
}

export function reciprocalRankFusion(lists: SearchHit[][], options?: { k?: number; limit?: number }): SearchHit[] {
  const k = options?.k ?? RRF_K;
  if (!Number.isFinite(k) || k < 0) {
    throw new Error("RRF k must be a non-negative number");
  }

  const fused = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    const ranked = [...list]
      .filter((hit) => Number.isFinite(hit.score))
      .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
    ranked.forEach((hit, index) => {
      const contribution = 1 / (k + index + 1);
      const existing = fused.get(hit.chunkId);
      if (existing) {
        existing.score += contribution;
        return;
      }
      fused.set(hit.chunkId, { hit, score: contribution });
    });
  }

  const hits = [...fused.values()]
    .map(({ hit, score }) => ({ ...hit, score }))
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));

  const limit = options?.limit;
  if (limit == null) return hits;
  if (!Number.isFinite(limit) || limit < 1) return [];
  return hits.slice(0, clampLimit(limit, hits.length));
}
