import { describe, expect, it } from "vitest";
import {
  JOB_NAMES,
  QUEUE_NAME,
  citationSchema,
  embedJobId,
  embedMeetingPayloadSchema,
  formatMeetingTimestamp,
  isAdmin,
  isLiveEmbedJobState,
  meetingPath,
  parseMeetingTimeParam,
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

describe("meeting links", () => {
  it("builds stable meeting paths with optional tMs", () => {
    expect(meetingPath("m1")).toBe("/meetings/m1");
    expect(meetingPath("m1", { tMs: 1500 })).toBe("/meetings/m1?t=1500");
    expect(meetingPath("m1", { tMs: null })).toBe("/meetings/m1");
    expect(meetingPath("m1", { tMs: -1 })).toBe("/meetings/m1");
    expect(meetingPath("a/b")).toBe("/meetings/a%2Fb");
  });

  it("parses t query values fail-closed on junk", () => {
    expect(parseMeetingTimeParam("0")).toBe(0);
    expect(parseMeetingTimeParam("1200")).toBe(1200);
    expect(parseMeetingTimeParam("-1")).toBeNull();
    expect(parseMeetingTimeParam("1.5")).toBeNull();
    expect(parseMeetingTimeParam("nope")).toBeNull();
    expect(parseMeetingTimeParam(undefined)).toBeNull();
  });

  it("formats timestamps for display", () => {
    expect(formatMeetingTimestamp(0)).toBe("0:00");
    expect(formatMeetingTimestamp(65_000)).toBe("1:05");
    expect(formatMeetingTimestamp(3_665_000)).toBe("1:01:05");
  });
});

describe("citations", () => {
  it("requires meeting, chunk, quote, and excerpt index n", () => {
    const citation = citationSchema.parse({
      n: 1,
      meetingId: "m1",
      chunkId: "c1",
      quote: "we decided on postgres",
      startMs: 1000,
    });
    expect(citation.quote).toContain("postgres");
    expect(citation.startMs).toBe(1000);
    expect(citation.n).toBe(1);
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
    expect(citations[0]?.n).toBe(1);
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
