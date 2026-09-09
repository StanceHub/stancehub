import { describe, expect, it, vi } from "vitest";
import { ChatCompletionTruncatedError, type ChatClient } from "@stancehub/ai";
import {
  MAX_SUMMARIZE_MAX_TOKENS,
  readSummarizeMaxTokens,
} from "./chat-config";
import {
  nextSummarizeTokenBudget,
  summarizeClaimDisposition,
  summarizeMissedClaimAction,
  summarizeWithChat,
} from "./processors/summarize-meeting";

describe("readSummarizeMaxTokens", () => {
  it("defaults to 4096", () => {
    expect(readSummarizeMaxTokens({})).toBe(4096);
  });

  it("reads and bounds SUMMARIZE_MAX_TOKENS", () => {
    expect(readSummarizeMaxTokens({ SUMMARIZE_MAX_TOKENS: "2048" })).toBe(2048);
    expect(() => readSummarizeMaxTokens({ SUMMARIZE_MAX_TOKENS: "10" })).toThrow(/SUMMARIZE_MAX_TOKENS/);
    expect(() => readSummarizeMaxTokens({ SUMMARIZE_MAX_TOKENS: "9000" })).toThrow(/SUMMARIZE_MAX_TOKENS/);
  });
});

describe("summarize claim helpers", () => {
  it("classifies generation disposition", () => {
    expect(summarizeClaimDisposition(1, 2)).toBe("wait");
    expect(summarizeClaimDisposition(3, 2)).toBe("stale");
    expect(summarizeClaimDisposition(2, 2)).toBe("claim");
    expect(summarizeClaimDisposition(null, 1)).toBe("stale");
  });

  it("does not treat same-generation running as success", () => {
    expect(summarizeMissedClaimAction("running")).toBe("retry_claim");
    expect(summarizeMissedClaimAction("pending")).toBe("retry_claim");
    expect(summarizeMissedClaimAction("ready")).toBe("already_ready");
    expect(summarizeMissedClaimAction("failed")).toBe("stale");
  });
});

describe("nextSummarizeTokenBudget", () => {
  it("doubles until the absolute ceiling", () => {
    expect(nextSummarizeTokenBudget(4096)).toBe(8192);
    expect(nextSummarizeTokenBudget(MAX_SUMMARIZE_MAX_TOKENS)).toBeNull();
  });
});

describe("summarizeWithChat", () => {
  const messages = [{ role: "user" as const, content: "hi" }];
  const valid = JSON.stringify({
    summary: "Ship invites this sprint.",
    actions: [{ title: "Draft copy", assigneeHint: "Alex" }],
  });

  it("bumps tokens on truncation before succeeding", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: "", finishReason: "length" })
      .mockResolvedValueOnce({ content: valid, finishReason: "stop" });
    const client = { chat } as unknown as ChatClient;

    const parsed = await summarizeWithChat({
      client,
      messages,
      maxTokens: 1024,
      meetingId: "m1",
      generation: 1,
    });
    expect(parsed.summary).toContain("Ship invites");
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0]?.[0]?.maxTokens).toBe(1024);
    expect(chat.mock.calls[0]?.[0]?.jsonObject).toBe(true);
    expect(chat.mock.calls[1]?.[0]?.maxTokens).toBe(2048);
    expect(chat.mock.calls[1]?.[0]?.jsonObject).toBe(true);
  });

  it("does not plain-retry transport errors at the same budget", async () => {
    const chat = vi.fn().mockRejectedValue(new Error("Chat request failed (500): nope"));
    const client = { chat } as unknown as ChatClient;
    await expect(
      summarizeWithChat({
        client,
        messages,
        maxTokens: 1024,
        meetingId: "m1",
        generation: 1,
      }),
    ).rejects.toThrow(/Chat request failed/);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("plain-retries only after JSON parse failure", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: "not-json", finishReason: "stop" })
      .mockResolvedValueOnce({ content: valid, finishReason: "stop" });
    const client = { chat } as unknown as ChatClient;
    const parsed = await summarizeWithChat({
      client,
      messages,
      maxTokens: 1024,
      meetingId: "m1",
      generation: 1,
    });
    expect(parsed.actions).toHaveLength(1);
    expect(chat.mock.calls[0]?.[0]?.jsonObject).toBe(true);
    expect(chat.mock.calls[1]?.[0]?.jsonObject).toBe(false);
  });

  it("fails closed when truncation cannot bump further", async () => {
    const chat = vi.fn().mockRejectedValue(new ChatCompletionTruncatedError("length"));
    const client = { chat } as unknown as ChatClient;
    await expect(
      summarizeWithChat({
        client,
        messages,
        maxTokens: MAX_SUMMARIZE_MAX_TOKENS,
        meetingId: "m1",
        generation: 1,
      }),
    ).rejects.toBeInstanceOf(ChatCompletionTruncatedError);
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
