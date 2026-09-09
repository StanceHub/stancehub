import type { TranscriptCue } from "./transcript";

export type TextChunk = {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
  startMs: number | null;
  endMs: number | null;
};

export const DEFAULT_CHUNK_MAX_CHARS = 480;

function sliceBound(text: string, start: number, maxChars: number) {
  const hardEnd = Math.min(start + maxChars, text.length);
  if (hardEnd === text.length) return text.length;
  const window = text.slice(start, hardEnd);
  const marks = ["\n\n", "\n", ". ", "? ", "! "];
  let best = -1;
  for (const mark of marks) {
    const index = window.lastIndexOf(mark);
    if (index >= Math.floor(maxChars * 0.4)) {
      best = Math.max(best, index + mark.length);
    }
  }
  if (best > 0) return start + best;
  const space = window.lastIndexOf(" ");
  if (space >= Math.floor(maxChars * 0.4)) return start + space + 1;
  return hardEnd;
}

export function chunkText(text: string, maxChars = DEFAULT_CHUNK_MAX_CHARS): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = sliceBound(trimmed, start, maxChars);
    if (end <= start) end = Math.min(start + maxChars, trimmed.length);
    const content = trimmed.slice(start, end).trim();
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        startOffset: start,
        endOffset: start + content.length,
        startMs: null,
        endMs: null,
      });
    }
    start = end;
    while (start < trimmed.length && /\s/.test(trimmed[start] ?? "")) start += 1;
  }
  return chunks;
}

export function chunkCues(cues: TranscriptCue[], maxChars = DEFAULT_CHUNK_MAX_CHARS): TextChunk[] {
  if (cues.length === 0) return [];
  const chunks: TextChunk[] = [];
  let buffer: TranscriptCue[] = [];
  let size = 0;
  let offset = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.map((cue) => cue.text).join("\n");
    chunks.push({
      index: chunks.length,
      content,
      startOffset: offset,
      endOffset: offset + content.length,
      startMs: buffer[0]?.startMs ?? null,
      endMs: buffer[buffer.length - 1]?.endMs ?? null,
    });
    offset += content.length + 1;
    buffer = [];
    size = 0;
  };

  for (const cue of cues) {
    const piece = cue.text;
    if (piece.length > maxChars) {
      flush();
      const parts = chunkText(piece, maxChars);
      for (const part of parts) {
        chunks.push({
          ...part,
          index: chunks.length,
          startOffset: offset,
          endOffset: offset + part.content.length,
          startMs: cue.startMs,
          endMs: cue.endMs,
        });
        offset += part.content.length + 1;
      }
      continue;
    }
    const nextSize = size === 0 ? piece.length : size + 1 + piece.length;
    if (buffer.length > 0 && nextSize > maxChars) flush();
    buffer.push(cue);
    size = size === 0 ? piece.length : size + 1 + piece.length;
  }
  flush();
  return chunks;
}
