/**
 * Pure AI package — no Drizzle / Redis / Next imports.
 * Sprint 0: stubs only. Real chunk/embed/cite land in Sprint 1–2.
 */

export type TextChunk = {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
};

export function chunkText(text: string, maxChars = 2000): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: TextChunk[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars) {
    const content = trimmed.slice(i, i + maxChars);
    chunks.push({
      index: chunks.length,
      content,
      startOffset: i,
      endOffset: i + content.length,
    });
  }
  return chunks;
}

export function createLlmClient(_opts: { baseUrl: string; apiKey: string }) {
  return {
    async embed(_texts: string[]): Promise<number[][]> {
      throw new Error("@stancehub/ai embed: not implemented until Sprint 1");
    },
    async chat(_messages: { role: string; content: string }[]): Promise<string> {
      throw new Error("@stancehub/ai chat: not implemented until Sprint 2");
    },
  };
}
