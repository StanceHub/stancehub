import { describe, expect, it } from "vitest";
import {
  JOB_NAMES,
  QUEUE_NAME,
  citationSchema,
  embedJobId,
  embedMeetingPayloadSchema,
  isAdmin,
  isLiveEmbedJobState,
  pingJobPayloadSchema,
} from "./index";

describe("roles", () => {
  it("treats admin and owner as admin", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("owner")).toBe(true);
    expect(isAdmin("member")).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("jobs", () => {
  it("exposes stable queue and job names", () => {
    expect(QUEUE_NAME).toBe("stancehub");
    expect(JOB_NAMES.ping).toBe("ping");
    expect(JOB_NAMES.embedMeeting).toBe("embed_meeting");
    expect(JOB_NAMES.summarizeMeeting).toBe("summarize_meeting");
  });

  it("parses ping payloads", () => {
    const parsed = pingJobPayloadSchema.parse({
      requestedAt: "2026-09-06T07:00:00.000Z",
      note: "hello",
    });
    expect(parsed.note).toBe("hello");
  });

  it("rejects invalid embed payloads", () => {
    expect(() => embedMeetingPayloadSchema.parse({ organizationId: "" })).toThrow();
  });

  it("defaults a missing embed generation and treats only live queue states as running", () => {
    expect(embedMeetingPayloadSchema.parse({ organizationId: "org", meetingId: "m1" }).generation).toBe(1);
    expect(embedJobId("m1", 2)).toBe("embed:m1:2");
    expect(isLiveEmbedJobState("active")).toBe(true);
    expect(isLiveEmbedJobState("waiting")).toBe(true);
    expect(isLiveEmbedJobState("failed")).toBe(false);
    expect(isLiveEmbedJobState("missing")).toBe(false);
  });
});

describe("citations", () => {
  it("requires meeting, chunk, and quote", () => {
    const citation = citationSchema.parse({
      meetingId: "m1",
      chunkId: "c1",
      quote: "we decided on postgres",
      startMs: 1000,
    });
    expect(citation.quote).toContain("postgres");
    expect(citation.startMs).toBe(1000);
  });
});

describe("meeting summary payload", () => {
  it("parses JSON actions from model text", async () => {
    const { parseMeetingSummaryPayload, summarizeJobId, citationsFromAnswer } = await import("./index");
    const parsed = parseMeetingSummaryPayload(
      'Here you go:\n{"summary":"Ship invites only.","actions":[{"title":"Write decision log","assigneeHint":"Jordan"}]}',
    );
    expect(parsed.summary).toContain("invites");
    expect(parsed.actions[0]?.title).toContain("decision log");
    expect(summarizeJobId("m1", 3)).toBe("summarize:m1:3");

    const citations = citationsFromAnswer("Decision is clear [1].", [
      {
        chunkId: "c1",
        meetingId: "m1",
        meetingTitle: "Planning",
        content: "Share links are out of this sprint.",
        startMs: 0,
        endMs: 1000,
      },
    ]);
    expect(citations[0]?.chunkId).toBe("c1");
  });

  it("returns no citations when the answer omits [n] markers", async () => {
    const { citationsFromAnswer } = await import("./index");
    const citations = citationsFromAnswer("I cannot find any evidence in the vault.", [
      {
        chunkId: "c1",
        meetingId: "m1",
        meetingTitle: "Planning",
        content: "Jordan will log the failed-payment rule.",
        startMs: 0,
        endMs: 1000,
      },
    ]);
    expect(citations).toEqual([]);
  });
});
