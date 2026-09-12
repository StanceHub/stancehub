import { citationSchema, type Citation } from "./citations";

export type AskHit = {
  chunkId: string;
  meetingId: string;
  meetingTitle: string;
  content: string;
  startMs: number | null;
  endMs: number | null;
};

const CITE_RE = /\[(\d+)\]/g;

export function buildAskContext(hits: AskHit[]) {
  return hits
    .map((hit, index) => {
      const n = index + 1;
      const timing =
        hit.startMs != null || hit.endMs != null
          ? ` (${hit.startMs ?? "?"}-${hit.endMs ?? "?"}ms)`
          : "";
      return `[${n}] meeting=${hit.meetingTitle} id=${hit.chunkId}${timing}\n${hit.content}`;
    })
    .join("\n\n");
}

export function buildAskMessages(query: string, hits: AskHit[]) {
  return [
    {
      role: "system" as const,
      content:
        "Answer using only the numbered meeting excerpts. " +
        "Cite sources as [n] matching the excerpt numbers. " +
        "If the excerpts are insufficient, say you cannot find that in the vault. " +
        "Do not invent facts.",
    },
    {
      role: "user" as const,
      content: `Question: ${query}\n\nExcerpts:\n${buildAskContext(hits)}`,
    },
  ];
}

export function citationsFromAnswer(answer: string, hits: AskHit[]): Citation[] {
  const cited = new Set<number>();
  for (const match of answer.matchAll(CITE_RE)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 1 && n <= hits.length) cited.add(n);
  }
  const citations: Citation[] = [];
  for (const n of [...cited].sort((a, b) => a - b)) {
    const hit = hits[n - 1]!;
    const quote = hit.content.trim().slice(0, 280);
    citations.push(
      citationSchema.parse({
        n,
        meetingId: hit.meetingId,
        chunkId: hit.chunkId,
        meetingTitle: hit.meetingTitle,
        quote: quote || hit.content.slice(0, 280) || "(empty)",
        startMs: hit.startMs,
        endMs: hit.endMs,
      }),
    );
  }
  return citations;
}
