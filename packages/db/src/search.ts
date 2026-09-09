import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { chunks, meetings } from "./schema/index";
import { DEFAULT_EMBEDDING_DIMENSIONS } from "./schema/vault";

export type SearchHit = {
  chunkId: string;
  meetingId: string;
  meetingTitle: string;
  content: string;
  score: number;
  startMs: number | null;
  endMs: number | null;
};

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

export async function searchChunksByKeyword(
  db: Database,
  input: { organizationId: string; query: string; limit?: number },
): Promise<SearchHit[]> {
  const query = input.query.trim();
  if (!query) return [];
  const limit = input.limit ?? 10;
  const rank = sql<number>`ts_rank(${chunks.contentTsv}, plainto_tsquery('english', ${query}))`;
  const rows = await db
    .select({
      chunkId: chunks.id,
      meetingId: chunks.meetingId,
      meetingTitle: meetings.title,
      content: chunks.content,
      startMs: chunks.startMs,
      endMs: chunks.endMs,
      score: rank,
    })
    .from(chunks)
    .innerJoin(meetings, eq(meetings.id, chunks.meetingId))
    .where(
      and(
        eq(chunks.organizationId, input.organizationId),
        sql`${chunks.contentTsv} @@ plainto_tsquery('english', ${query})`,
      ),
    )
    .orderBy(desc(rank))
    .limit(limit);

  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

export async function searchChunksByVector(
  db: Database,
  input: { organizationId: string; embedding: number[]; limit?: number },
): Promise<SearchHit[]> {
  if (input.embedding.length === 0) return [];
  const limit = input.limit ?? 10;
  const literal = vectorLiteral(input.embedding);
  const rows = await db
    .select({
      chunkId: chunks.id,
      meetingId: chunks.meetingId,
      meetingTitle: meetings.title,
      content: chunks.content,
      startMs: chunks.startMs,
      endMs: chunks.endMs,
      score: sql<number>`1 - (${chunks.embedding} <=> ${literal}::vector)`,
    })
    .from(chunks)
    .innerJoin(meetings, eq(meetings.id, chunks.meetingId))
    .where(eq(chunks.organizationId, input.organizationId))
    .orderBy(sql`${chunks.embedding} <=> ${literal}::vector`)
    .limit(limit);

  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}
