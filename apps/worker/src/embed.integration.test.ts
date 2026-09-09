import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { createEmbeddingClient } from "@stancehub/ai";
import {
  chunks,
  createDb,
  meetings,
  organization,
  searchChunksByKeyword,
  searchChunksByVector,
  transcripts,
} from "@stancehub/db";
import { closeWorkerDb } from "./db";
import { processEmbedMeeting } from "./processors/embed-meeting";

const enabled = process.env.RUN_INTEGRATION === "1";
const samplePath =
  process.env.TRANSCRIPT_FIXTURE ??
  new URL("../fixtures/meeting-sample.vtt", import.meta.url).pathname;

describe.skipIf(!enabled)("embed vault integration", () => {
  const organizationId = `org_it_${Date.now()}`;
  const meetingId = `mtg_it_${Date.now()}`;
  const db = createDb(process.env.DATABASE_URL ?? "");

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, organizationId));
    await closeWorkerDb();
  });

  it("stores a transcript, embeds chunks, and searches them", async () => {
    const raw = readFileSync(samplePath, "utf8");
    await db.insert(organization).values({
      id: organizationId,
      name: "Integration",
      slug: organizationId,
    });
    await db.insert(meetings).values({
      id: meetingId,
      organizationId,
      title: "Planning sample",
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

    const result = await processEmbedMeeting({ data: { organizationId, meetingId } } as Job);
    expect(result.ok).toBe(true);
    expect(result.chunks).toBeGreaterThan(1);

    const stored = await db.select().from(chunks).where(eq(chunks.meetingId, meetingId));
    expect(stored.length).toBe(result.chunks);
    expect(stored[0]?.embedding.length).toBe(768);
    expect(stored.every((row) => row.tokenCount > 0)).toBe(true);

    const keyword = await searchChunksByKeyword(db, {
      organizationId,
      query: "roadmap",
      limit: 5,
    });
    expect(keyword.length).toBeGreaterThan(0);

    const envModel = process.env.EMBEDDING_MODEL ?? "";
    const client = createEmbeddingClient({
      baseUrl: process.env.LLM_BASE_URL ?? "",
      apiKey: process.env.LLM_API_KEY ?? "",
      model: envModel,
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? "768"),
    });
    const [embedding] = await client.embed(["roadmap decision"]);
    const vector = await searchChunksByVector(db, {
      organizationId,
      embedding: embedding ?? [],
      limit: 5,
    });
    expect(vector.length).toBeGreaterThan(0);

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), eq(meetings.organizationId, organizationId)));
    expect(meeting?.pipelineStatus).toBe("ready");
  });
});
