import { describe, expect, it } from "vitest";
import { chunkCues, chunkText } from "./chunk";
import { buildEmbeddingRequest, createEmbeddingClient, createLlmClient } from "./embed";
import { parseTranscript } from "./transcript";

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

  it("prefers a sentence boundary over a hard cut", () => {
    const text = "Ship the vault search this week. The upload path can follow after that.";
    const chunks = chunkText(text, 40);
    expect(chunks[0]?.content.endsWith(".")).toBe(true);
    expect(chunks[1]?.content).toContain("upload path");
  });
});

describe("parseTranscript", () => {
  it("reads voice cues and timestamps", () => {
    const parsed = parseTranscript(
      `WEBVTT

00:00:00.000 --> 00:00:04.000
<v Priya>We should ship the vault search this week.</v>

00:00:04.250 --> 00:00:08.000
<v Alex>I will own the upload path.</v>
`,
    );
    expect(parsed.format).toBe("vtt");
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0]?.text).toBe("Priya: We should ship the vault search this week.");
    expect(parsed.cues[0]?.startMs).toBe(0);
    expect(parsed.cues[1]?.endMs).toBe(8000);
  });

  it("keeps the first cue when the file has no header", () => {
    const raw = `00:00:00.000 --> 00:00:02.000
<v Priya>First cue.</v>

00:00:02.250 --> 00:00:04.000
<v Alex>Second cue.</v>
`;
    const parsed = parseTranscript(raw, "vtt");
    expect(parsed.format).toBe("vtt");
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0]?.text).toContain("First cue");
    expect(parsed.cues[0]?.startMs).toBe(0);
  });

  it("reads srt cues", () => {
    const parsed = parseTranscript(
      `1
00:00:01,000 --> 00:00:03,500
The decision is to wait on the redesign.
`,
      "notes.srt",
    );
    expect(parsed.format).toBe("srt");
    expect(parsed.cues[0]?.text).toContain("wait on the redesign");
    expect(parsed.cues[0]?.startMs).toBe(1000);
  });
});

describe("chunkCues", () => {
  it("keeps cue timestamps on short groups", () => {
    const chunks = chunkCues(
      [
        { text: "alpha", startMs: 0, endMs: 1000 },
        { text: "beta", startMs: 1000, endMs: 2000 },
      ],
      100,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startMs).toBe(0);
    expect(chunks[0]?.endMs).toBe(2000);
    expect(chunks[0]?.content).toContain("alpha");
  });
});

describe("embedding request", () => {
  it("targets the compatible embeddings path", () => {
    const request = buildEmbeddingRequest({
      baseUrl: "http://127.0.0.1:8080/v1/",
      model: "embed",
      input: ["hello"],
    });
    expect(request.url).toBe("http://127.0.0.1:8080/v1/embeddings");
    expect(request.body).toEqual({ model: "embed", input: ["hello"] });
  });

  it("aborts an embeddings request that exceeds the timeout", async () => {
    const client = createEmbeddingClient({
      baseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "x",
      model: "embed",
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("missing timeout signal"));
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    });
    await expect(client.embed(["hello"])).rejects.toBeTruthy();
  });

  it("requires a model name before embedding", () => {
    const llm = createLlmClient({ baseUrl: "http://127.0.0.1:8080/v1", apiKey: "x" });
    expect(() => llm.embed(["hi"])).toThrow(/EMBEDDING_MODEL/);
  });
});
