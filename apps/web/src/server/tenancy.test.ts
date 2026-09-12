import { describe, expect, it } from "vitest";
import { meetingPath, parseMeetingTimeParam } from "@stancehub/shared";
import { meetingVisibleInOrg, NOT_FOUND_BODY } from "./tenancy";
import { filterHitsForOrganization } from "./tenancy-search";

describe("tenancy contracts", () => {
  it("uses a uniform not-found body (no existence oracle)", () => {
    expect(NOT_FOUND_BODY).toEqual({ error: "not found" });
  });

  it("treats wrong-org meetings as not visible (same as missing)", () => {
    expect(meetingVisibleInOrg({ organizationId: "org-a" }, "org-a")).toBe(true);
    expect(meetingVisibleInOrg({ organizationId: "org-b" }, "org-a")).toBe(false);
    expect(meetingVisibleInOrg(null, "org-a")).toBe(false);
  });
});

describe("meeting deep-link contract", () => {
  it("keeps meeting hrefs org-agnostic and encodes tMs safely", () => {
    expect(meetingPath("meet-1", { tMs: 900 })).toBe("/meetings/meet-1?t=900");
    expect(parseMeetingTimeParam("900")).toBe(900);
    expect(parseMeetingTimeParam("abc")).toBeNull();
  });
});

describe("filterHitsForOrganization", () => {
  it("drops hits from other orgs (defense in depth for ask/search)", () => {
    const hits = [
      {
        chunkId: "c1",
        meetingId: "m1",
        organizationId: "org-a",
        meetingTitle: "A",
        content: "x",
        score: 1,
        startMs: null,
        endMs: null,
      },
      {
        chunkId: "c2",
        meetingId: "m2",
        organizationId: "org-b",
        meetingTitle: "B",
        content: "y",
        score: 1,
        startMs: null,
        endMs: null,
      },
    ];
    expect(filterHitsForOrganization(hits, "org-a")).toEqual([hits[0]]);
  });
});
