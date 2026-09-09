import { resolveChatEndpoint } from "@stancehub/ai";

export const DEFAULT_SUMMARIZE_MAX_TOKENS = 4096;
export const MIN_SUMMARIZE_MAX_TOKENS = 512;
export const MAX_SUMMARIZE_MAX_TOKENS = 8192;

export function readChatConfig(env: NodeJS.ProcessEnv = process.env) {
  return resolveChatEndpoint(env as Record<string, string | undefined>);
}

/** Completion budget for summarize (reasoning models need headroom above the JSON). */
export function readSummarizeMaxTokens(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.SUMMARIZE_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_SUMMARIZE_MAX_TOKENS;
  if (!/^\d+$/.test(raw)) {
    throw new Error("SUMMARIZE_MAX_TOKENS must be a positive integer");
  }
  const value = Number(raw);
  if (value < MIN_SUMMARIZE_MAX_TOKENS || value > MAX_SUMMARIZE_MAX_TOKENS) {
    throw new Error(
      `SUMMARIZE_MAX_TOKENS must be between ${MIN_SUMMARIZE_MAX_TOKENS} and ${MAX_SUMMARIZE_MAX_TOKENS}`,
    );
  }
  return value;
}
