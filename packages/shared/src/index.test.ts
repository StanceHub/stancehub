import { describe, expect, it } from "vitest";
import {
  JOB_NAMES,
  QUEUE_NAME,
  citationSchema,
  isAdmin,
  pingJobPayloadSchema,
  embedMeetingPayloadSchema,
} from "./index";

describe("roles", () => {
  it("treats admin as admin", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("member")).toBe(false);
  });
});

describe("jobs", () => {
  it("exposes stable queue and job names", () => {
    expect(QUEUE_NAME).toBe("stancehub");
    expect(JOB_NAMES.ping).toBe("ping");
    expect(JOB_NAMES.embedMeeting).toBe("embed_meeting");
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
});

describe("citations", () => {
  it("requires meeting, chunk, and quote", () => {
    const citation = citationSchema.parse({
      meetingId: "m1",
      chunkId: "c1",
      quote: "we decided on postgres",
    });
    expect(citation.quote).toContain("postgres");
  });
});
