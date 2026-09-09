/**
 * Pure AI package — no Drizzle / Redis / Next imports.
 */

export { chunkCues, chunkText, DEFAULT_CHUNK_MAX_CHARS, type TextChunk } from "./chunk";
export {
  buildEmbeddingRequest,
  createEmbeddingClient,
} from "./embed";
export {
  buildChatRequest,
  createChatClient,
  ChatCompletionTruncatedError,
  isChatCompletionTruncatedError,
  type ChatClient,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
} from "./chat";
export {
  resolveChatEndpoint,
  resolveEmbeddingEndpoint,
  type ChatEndpoint,
  type EmbeddingEndpoint,
} from "./profiles";
export { parseTranscript, type ParsedTranscript, type TranscriptCue } from "./transcript";
