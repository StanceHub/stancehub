import { describe, expect, it } from "vitest";
import { linkifyCitationMarkers, normalizeAskMarkdown } from "./markdown-answer";

describe("normalizeAskMarkdown", () => {
  it("turns HTML breaks into newlines without keeping tags", () => {
    expect(normalizeAskMarkdown("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("preserves GFM table pipes for the markdown parser", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |";
    expect(normalizeAskMarkdown(table)).toContain("| A | B |");
  });
});

describe("linkifyCitationMarkers", () => {
  it("wraps [n] as citation markdown links", () => {
    expect(linkifyCitationMarkers("Claim [1] and [2].")).toBe(
      "Claim [\\[1\\]](citation:1) and [\\[2\\]](citation:2).",
    );
  });
});
