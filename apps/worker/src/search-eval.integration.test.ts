import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { createEmbeddingClient, DEFAULT_CHUNK_MAX_CHARS, resolveEmbeddingEndpoint } from "@stancehub/ai";
import {
  attachMeetingSearchStats,
  chunks,
  createDb,
  meetings,
  orgSearchStats,
  orgSearchStatsLockSql,
  orgTermDf,
  reciprocalRankFusion,
  removeMeetingChunksAndStats,
  searchChunksByKeyword,
  searchChunksByVector,
  organization,
  transcripts,
} from "@stancehub/db";
import { closeWorkerDb } from "./db";
import { processEmbedMeeting } from "./processors/embed-meeting";

const enabled = process.env.RUN_INTEGRATION === "1";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const goldensPath = join(fixturesDir, "search-goldens.json");
const zeros = () => Array.from({ length: 768 }, () => 0);

type GoldenFile = Array<{
  fixture: string;
  title: string;
  goldens: Array<{ query: string; needle: string }>;
}>;

describe.skipIf(!enabled)("bm25 formula against postgres", () => {
  const organizationId = `org_bm25_${Date.now()}`;
  const meetingId = `mtg_bm25_${Date.now()}`;
  const db = createDb(process.env.DATABASE_URL ?? "");

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, organizationId));
    await closeWorkerDb();
  });

  it("stores token occurrence length and ranks with maintained DF/avgdl", async () => {
    await db.insert(organization).values({
      id: organizationId,
      name: "BM25",
      slug: organizationId,
    });
    await db.insert(meetings).values({
      id: meetingId,
      organizationId,
      title: "BM25 fixture",
      source: "upload",
      pipelineStatus: "pending",
    });
    const transcriptId = crypto.randomUUID();
    await db.insert(transcripts).values({
      id: transcriptId,
      organizationId,
      meetingId,
      rawText: "fixture",
      format: "plain",
      version: 1,
    });

    const docs = [
      { id: crypto.randomUUID(), content: "alpha alpha beta", chunkIndex: 0 },
      { id: crypto.randomUUID(), content: "beta gamma", chunkIndex: 1 },
      { id: crypto.randomUUID(), content: "delta only", chunkIndex: 2 },
    ];
    await db.insert(chunks).values(
      docs.map((doc) => ({
        id: doc.id,
        organizationId,
        meetingId,
        transcriptId,
        content: doc.content,
        chunkIndex: doc.chunkIndex,
        embedding: zeros(),
        tokenCount: 0,
      })),
    );

    await db.transaction(async (tx) => {
      await tx.execute(orgSearchStatsLockSql(organizationId));
      await attachMeetingSearchStats(tx, { organizationId, meetingId });
    });

    const stored = await db.select().from(chunks).where(eq(chunks.meetingId, meetingId));
    const alphaDoc = stored.find((row) => row.content === "alpha alpha beta");
    expect(alphaDoc?.tokenCount).toBeGreaterThan(2);

    const tokenCheck = await db.execute(sql`
      SELECT coalesce(sum(cardinality(u.positions)), 0)::int AS tokens
      FROM chunks c
      CROSS JOIN LATERAL unnest(c.content_tsv) AS u(lexeme, positions)
      WHERE c.id = ${alphaDoc!.id}
    `);
    const tokenRows = tokenCheck as unknown as Array<{ tokens: number }>;
    const expectedTokens = Number(tokenRows[0]?.tokens);
    expect(alphaDoc?.tokenCount).toBe(expectedTokens);

    const [stats] = await db.select().from(orgSearchStats).where(eq(orgSearchStats.organizationId, organizationId));
    expect(stats?.nDocs).toBe(3);
    expect(stats?.sumTokenCount).toBe(stored.reduce((sum, row) => sum + row.tokenCount, 0));

    const betaDf = await db
      .select()
      .from(orgTermDf)
      .where(and(eq(orgTermDf.organizationId, organizationId), eq(orgTermDf.lexeme, "beta")));
    expect(betaDf[0]?.nQi).toBe(2);

    const started = performance.now();
    const hits = await searchChunksByKeyword(db, {
      organizationId,
      query: "alpha",
      limit: 3,
      statementTimeoutMs: 2000,
    });
    const elapsed = performance.now() - started;

    expect(hits[0]?.content).toContain("alpha");
    expect(hits.every((hit, index) => index === 0 || hit.score <= hits[index - 1]!.score)).toBe(true);
    expect(hits.every((hit) => Number.isFinite(hit.score) && hit.score > 0)).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe.skipIf(!enabled)("search eval against multi-meeting fixtures", () => {
  const organizationId = `org_eval_${Date.now()}`;
  const db = createDb(process.env.DATABASE_URL ?? "");
  const catalog = JSON.parse(readFileSync(goldensPath, "utf8")) as GoldenFile;
  const meetingIds = catalog.map((_, index) => `mtg_eval_${Date.now()}_${index}`);

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, organizationId));
    await closeWorkerDb();
  });

  it("hits goldens at k=3, keeps org stats correct across meetings, and subtracts on delete", async () => {
    await db.insert(organization).values({
      id: organizationId,
      name: "Eval",
      slug: organizationId,
    });

    for (const [index, entry] of catalog.entries()) {
      const meetingId = meetingIds[index]!;
      const raw = readFileSync(join(fixturesDir, entry.fixture), "utf8");
      await db.insert(meetings).values({
        id: meetingId,
        organizationId,
        title: entry.title,
        source: "upload",
        pipelineStatus: "pending",
      });
      await db.insert(transcripts).values({
        id: crypto.randomUUID(),
        organizationId,
        meetingId,
        rawText: raw,
        format: "vtt",
        version: 1,
      });
      const result = await processEmbedMeeting({
        data: { organizationId, meetingId, generation: 1 },
      } as Job);
      expect(result.ok).toBe(true);
    }

    const [statsAfterEmbed] = await db
      .select()
      .from(orgSearchStats)
      .where(eq(orgSearchStats.organizationId, organizationId));
    const allChunks = await db.select().from(chunks).where(eq(chunks.organizationId, organizationId));
    expect(statsAfterEmbed?.nDocs).toBe(allChunks.length);
    expect(statsAfterEmbed?.sumTokenCount).toBe(allChunks.reduce((sum, row) => sum + row.tokenCount, 0));
    expect(allChunks.every((row) => row.tokenCount > 0)).toBe(true);
    expect(allChunks.every((row) => row.content.length <= DEFAULT_CHUNK_MAX_CHARS)).toBe(true);

    for (const [index, entry] of catalog.entries()) {
      const meetingId = meetingIds[index]!;
      for (const golden of entry.goldens) {
        const started = performance.now();
        const keyword = await searchChunksByKeyword(db, {
          organizationId,
          query: golden.query,
          limit: 8,
        });
        expect(performance.now() - started).toBeLessThan(2000);
        const top = keyword.slice(0, 3);
        expect(top.some((hit) => hit.content.toLowerCase().includes(golden.needle.toLowerCase()))).toBe(true);
        expect(top.some((hit) => hit.meetingId === meetingId)).toBe(true);
      }
    }

    const reembedId = meetingIds[0]!;
    const [statsBeforeReembed] = await db
      .select()
      .from(orgSearchStats)
      .where(eq(orgSearchStats.organizationId, organizationId));
    const reembed = await processEmbedMeeting({
      data: { organizationId, meetingId: reembedId, generation: 1 },
    } as Job);
    expect(reembed.ok).toBe(true);
    const [statsAfterReembed] = await db
      .select()
      .from(orgSearchStats)
      .where(eq(orgSearchStats.organizationId, organizationId));
    expect(statsAfterReembed?.nDocs).toBe(statsBeforeReembed?.nDocs);
    expect(statsAfterReembed?.sumTokenCount).toBe(statsBeforeReembed?.sumTokenCount);

    const deleteId = meetingIds[meetingIds.length - 1]!;
    const deletedChunkCount = (
      await db.select().from(chunks).where(eq(chunks.meetingId, deleteId))
    ).length;
    await db.transaction(async (tx) => {
      await tx.execute(orgSearchStatsLockSql(organizationId));
      await removeMeetingChunksAndStats(tx, { organizationId, meetingId: deleteId });
      await tx.delete(meetings).where(eq(meetings.id, deleteId));
    });

    const remaining = await db.select().from(chunks).where(eq(chunks.organizationId, organizationId));
    const [statsAfterDelete] = await db
      .select()
      .from(orgSearchStats)
      .where(eq(orgSearchStats.organizationId, organizationId));
    expect(statsAfterDelete?.nDocs).toBe((statsAfterEmbed?.nDocs ?? 0) - deletedChunkCount);
    expect(statsAfterDelete?.sumTokenCount).toBe(remaining.reduce((sum, row) => sum + row.tokenCount, 0));
    expect(remaining.every((row) => row.meetingId !== deleteId)).toBe(true);

    const endpoint = resolveEmbeddingEndpoint(process.env as Record<string, string | undefined>);
    const client = createEmbeddingClient({
      baseUrl: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      model: endpoint.model,
      dimensions: endpoint.dimensions,
      timeoutMs: 8000,
    });
    const query = "share links out of sprint";
    const [embedding] = await client.embed([query]);
    const vector = await searchChunksByVector(db, {
      organizationId,
      embedding: embedding ?? [],
      limit: 8,
    });
    const keyword = await searchChunksByKeyword(db, { organizationId, query, limit: 8 });
    const fused = reciprocalRankFusion([keyword, vector], { limit: 3 });
    expect(fused.some((hit) => /share links are out of this sprint/i.test(hit.content))).toBe(true);
  });
});
