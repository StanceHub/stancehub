import { describe, expect, it, vi } from "vitest";
import { ChatCompletionTruncatedError, type ChatClient } from "@stancehub/ai";
import { askWithChat, MAX_ASK_MAX_TOKENS, readAskMaxTokens } from "./ask";

describe("readAskMaxTokens", () => {
  it("defaults to 2048 and bounds ASK_MAX_TOKENS", () => {
    expect(readAskMaxTokens({})).toBe(2048);
    expect(readAskMaxTokens({ ASK_MAX_TOKENS: "1024" })).toBe(1024);
    expect(() => readAskMaxTokens({ ASK_MAX_TOKENS: "10" })).toThrow(/ASK_MAX_TOKENS/);
  });
});

describe("askWithChat", () => {
  const messages = [{ role: "user" as const, content: "hi" }];

  it("bumps once on truncation", async () => {
    const chat = vi
      .fn()
      .mockRejectedValueOnce(new ChatCompletionTruncatedError("length"))
      .mockResolvedValueOnce({ content: "Share links are out [1].", finishReason: "stop" });
    const client = { chat } as unknown as ChatClient;
    const content = await askWithChat({
      client,
      messages,
      maxTokens: 1024,
      organizationId: "org",
      queryLength: 12,
    });
    expect(content).toContain("Share links");
    expect(chat.mock.calls[1]?.[0]?.maxTokens).toBe(2048);
  });

  it("fails closed at the ask token ceiling", async () => {
    const chat = vi.fn().mockRejectedValue(new ChatCompletionTruncatedError("length"));
    const client = { chat } as unknown as ChatClient;
    await expect(
      askWithChat({
        client,
        messages,
        maxTokens: MAX_ASK_MAX_TOKENS,
        organizationId: "org",
        queryLength: 12,
      }),
    ).rejects.toBeInstanceOf(ChatCompletionTruncatedError);
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
