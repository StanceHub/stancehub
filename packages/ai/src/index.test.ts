import { describe, expect, it } from "vitest";
import { chunkText, createLlmClient } from "./index";

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text into ordered chunks", () => {
    const text = "a".repeat(4500);
    const chunks = chunkText(text, 2000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.content.length).toBe(2000);
    expect(chunks[2]?.content.length).toBe(500);
  });
});

describe("createLlmClient", () => {
  it("stubs embed and chat until later sprints", async () => {
    const llm = createLlmClient({ baseUrl: "http://localhost", apiKey: "x" });
    await expect(llm.embed(["hi"])).rejects.toThrow(/Sprint 1/);
    await expect(llm.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/Sprint 2/);
  });
});
