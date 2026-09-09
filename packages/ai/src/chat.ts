export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  url: string;
  body: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" };
  };
};

export type ChatResult = {
  content: string;
  finishReason: string | null;
};

export class ChatCompletionTruncatedError extends Error {
  readonly code = "CHAT_COMPLETION_TRUNCATED" as const;
  readonly finishReason: string;
  readonly partialContent: string;

  constructor(finishReason: string, partialContent = "") {
    super("Chat completion truncated");
    this.name = "ChatCompletionTruncatedError";
    this.finishReason = finishReason;
    this.partialContent = partialContent;
  }
}

export function isChatCompletionTruncatedError(
  error: unknown,
): error is ChatCompletionTruncatedError {
  return error instanceof ChatCompletionTruncatedError;
}

export function buildChatRequest(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonObject?: boolean;
}): ChatRequest {
  const base = opts.baseUrl.replace(/\/$/, "");
  const body: ChatRequest["body"] = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.maxTokens != null) body.max_tokens = opts.maxTokens;
  if (opts.jsonObject) body.response_format = { type: "json_object" };
  return {
    url: `${base}/chat/completions`,
    body,
  };
}

export type ChatClient = {
  chat(input: {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    jsonObject?: boolean;
  }): Promise<ChatResult>;
};

const DEFAULT_CHAT_TIMEOUT_MS = 120_000;

export function createChatClient(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): ChatClient {
  if (!opts.model.trim()) {
    throw new Error("LLM_MODEL is required");
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS;

  return {
    async chat(input) {
      if (input.messages.length === 0) {
        throw new Error("Chat requires at least one message");
      }
      const request = buildChatRequest({
        baseUrl: opts.baseUrl,
        model: opts.model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        jsonObject: input.jsonObject,
      });
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Chat request failed (${response.status}): ${detail.slice(0, 300)}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string | null;
          message?: { content?: string | null };
        }>;
      };
      const choice = payload.choices?.[0];
      const finishReason = choice?.finish_reason ?? null;
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        if (finishReason === "length") {
          throw new ChatCompletionTruncatedError("length", typeof content === "string" ? content : "");
        }
        throw new Error("Chat response missing content");
      }
      return { content, finishReason };
    },
  };
}
