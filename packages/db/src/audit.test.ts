import { describe, expect, it } from "vitest";
import {
  AUDIT_QUERY_TEXT_MAX,
  resolveAuditQueryText,
  truncateAuditReason,
} from "./audit";

describe("audit helpers", () => {
  it("keeps query_text null unless AUDIT_STORE_QUERY_TEXT=1", () => {
    const long = "a".repeat(200);
    expect(resolveAuditQueryText(long, {})).toBeNull();
    expect(resolveAuditQueryText(long, { AUDIT_STORE_QUERY_TEXT: "0" })).toBeNull();
  });

  it("truncates opt-in query text to 80 chars", () => {
    const long = "b".repeat(200);
    const stored = resolveAuditQueryText(long, { AUDIT_STORE_QUERY_TEXT: "1" });
    expect(stored).toHaveLength(AUDIT_QUERY_TEXT_MAX);
    expect(stored).toBe(long.slice(0, AUDIT_QUERY_TEXT_MAX));
  });

  it("truncates failure reasons for metadata", () => {
    expect(truncateAuditReason("x".repeat(500), 120)).toHaveLength(120);
  });
});
