export type TranscriptCue = {
  text: string;
  startMs: number | null;
  endMs: number | null;
};

export type ParsedTranscript = {
  format: "vtt" | "srt" | "plain";
  text: string;
  cues: TranscriptCue[];
};

const VTT_TIME =
  /(?:(\d{2,}):)?(\d{2}):(\d{2})[.](\d{3})\s+-->\s+(?:(\d{2,}):)?(\d{2}):(\d{2})[.](\d{3})/;
const SRT_TIME =
  /(?:(\d{2,}):)?(\d{2}):(\d{2})[,](\d{3})\s+-->\s+(?:(\d{2,}):)?(\d{2}):(\d{2})[,](\d{3})/;

function toMs(h: string | undefined, m: string, s: string, ms: string) {
  const hours = h ? Number(h) : 0;
  return ((hours * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
}

function stripVoice(raw: string) {
  const voice = raw.match(/^<v\s+([^>]+)>([\s\S]*)<\/v>\s*$/i);
  if (voice) {
    const name = voice[1]?.trim() ?? "";
    const body = (voice[2] ?? "").replace(/<[^>]+>/g, "").trim();
    return name ? `${name}: ${body}` : body;
  }
  return raw.replace(/<[^>]+>/g, "").trim();
}

function parseTimed(
  body: string,
  timeRe: RegExp,
  format: "vtt" | "srt",
): ParsedTranscript {
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues: TranscriptCue[] = [];
  let i = 0;
  if (format === "vtt" && (lines[0] ?? "").trim().startsWith("WEBVTT")) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = line.match(timeRe);
    if (!match) {
      i += 1;
      continue;
    }
    const startMs = toMs(match[1], match[2] ?? "0", match[3] ?? "0", match[4] ?? "0");
    const endMs = toMs(match[5], match[6] ?? "0", match[7] ?? "0", match[8] ?? "0");
    i += 1;
    const parts: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "") {
      parts.push(lines[i] ?? "");
      i += 1;
    }
    const text = stripVoice(parts.join(" ").replace(/\s+/g, " ").trim());
    if (text) cues.push({ text, startMs, endMs });
    while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;
  }

  return {
    format,
    text: cues.map((cue) => cue.text).join("\n"),
    cues,
  };
}

function formatFromHint(hint: string | undefined): "vtt" | "srt" | "plain" | null {
  const value = hint?.trim().toLowerCase() ?? "";
  if (!value) return null;
  if (value === "vtt" || value.endsWith(".vtt")) return "vtt";
  if (value === "srt" || value.endsWith(".srt")) return "srt";
  if (value === "plain" || value === "txt" || value.endsWith(".txt")) return "plain";
  return null;
}

export function parseTranscript(raw: string, hint?: string): ParsedTranscript {
  const text = raw.replace(/^\uFEFF/, "");
  const trimmed = text.trim();
  const hinted = formatFromHint(hint);

  if (hinted === "plain") return { format: "plain", text: trimmed, cues: [] };
  if (hinted === "vtt" || trimmed.startsWith("WEBVTT")) {
    return parseTimed(text, VTT_TIME, "vtt");
  }
  if (hinted === "srt" || /^\d+\s*\n\d{2}:\d{2}:\d{2},/.test(trimmed)) {
    return parseTimed(text, SRT_TIME, "srt");
  }
  return { format: "plain", text: trimmed, cues: [] };
}
