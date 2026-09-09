import {
  ChatCompletionTruncatedError,
  isChatCompletionTruncatedError,
  type ChatClient,
  type ChatMessage,
} from "@stancehub/ai";

export { buildAskMessages, citationsFromAnswer } from "@stancehub/shared";

export const DEFAULT_ASK_MAX_TOKENS = 2048;
export const MIN_ASK_MAX_TOKENS = 512;
export const MAX_ASK_MAX_TOKENS = 8192;

export function readAskMaxTokens(env: Record<string, string | undefined> = process.env) {
  const raw = env.ASK_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_ASK_MAX_TOKENS;
  if (!/^\d+$/.test(raw)) {
    throw new Error("ASK_MAX_TOKENS must be a positive integer");
  }
  const value = Number(raw);
  if (value < MIN_ASK_MAX_TOKENS || value > MAX_ASK_MAX_TOKENS) {
    throw new Error(`ASK_MAX_TOKENS must be between ${MIN_ASK_MAX_TOKENS} and ${MAX_ASK_MAX_TOKENS}`);
  }
  return value;
}

function nextAskTokenBudget(current: number) {
  const bumped = Math.min(current * 2, MAX_ASK_MAX_TOKENS);
  return bumped > current ? bumped : null;
}

/**
 * Ask chat with truncation-aware retry for reasoning models (e.g. gpt-oss cloud).
 * Does not use message.reasoning as content.
 */
export async function askWithChat(input: {
  client: ChatClient;
  messages: ChatMessage[];
  maxTokens: number;
  organizationId: string;
  queryLength: number;
}) {
  const run = async (maxTokens: number) => {
    const result = await input.client.chat({
      messages: input.messages,
      temperature: 0.2,
      maxTokens,
    });
    if (result.finishReason === "length") {
      throw new ChatCompletionTruncatedError("length", result.content);
    }
    return result.content;
  };

  try {
    return await run(input.maxTokens);
  } catch (error) {
    if (!isChatCompletionTruncatedError(error)) throw error;
    const bumped = nextAskTokenBudget(input.maxTokens);
    if (bumped == null) throw error;
    console.warn(
      JSON.stringify({
        event: "vault.ask.truncate_retry",
        organizationId: input.organizationId,
        queryLength: input.queryLength,
        fromMaxTokens: input.maxTokens,
        toMaxTokens: bumped,
        finishReason: error.finishReason,
      }),
    );
    return await run(bumped);
  }
}
