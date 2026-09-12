"use client";

import { useEffect, useRef } from "react";
import { formatMeetingTimestamp } from "@stancehub/shared";
import type { TranscriptCue } from "@stancehub/ai";

function cueMatchesFocus(cue: TranscriptCue, focusMs: number) {
  if (cue.startMs == null || cue.endMs == null) return false;
  return cue.startMs <= focusMs && focusMs < cue.endMs;
}

function nearestCueIndex(cues: TranscriptCue[], focusMs: number) {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cues.length; i += 1) {
    const start = cues[i]?.startMs;
    if (start == null) continue;
    const distance = Math.abs(start - focusMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function TranscriptView({
  cues,
  rawText,
  focusMs,
}: {
  cues: TranscriptCue[];
  rawText: string;
  focusMs: number | null;
}) {
  const focusRef = useRef<HTMLDivElement | null>(null);

  const matchedIndex =
    focusMs == null ? -1 : cues.findIndex((cue) => cueMatchesFocus(cue, focusMs));
  const highlightIndex =
    matchedIndex >= 0 ? matchedIndex : focusMs == null ? -1 : nearestCueIndex(cues, focusMs);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightIndex, focusMs]);

  if (cues.length === 0) {
    return (
      <pre id="transcript" style={{ whiteSpace: "pre-wrap", maxHeight: 480, overflow: "auto" }}>
        {rawText}
      </pre>
    );
  }

  return (
    <div>
      {focusMs != null ? (
        <p>
          <small>
            Citation target ~{formatMeetingTimestamp(focusMs)}
            {highlightIndex < 0 ? " (no timed cue matched)" : ""}
          </small>
        </p>
      ) : null}
      <div id="transcript" style={{ maxHeight: 480, overflow: "auto", borderTop: "1px solid #ddd" }}>
        {cues.map((cue, index) => {
          const active = index === highlightIndex;
          return (
            <div
              key={`${cue.startMs ?? "x"}-${index}`}
              ref={active ? focusRef : undefined}
              data-start-ms={cue.startMs ?? undefined}
              style={{
                padding: "6px 4px",
                background: active ? "#fff3bf" : undefined,
              }}
            >
              {cue.startMs != null ? (
                <small style={{ marginRight: 8, color: "#666" }}>
                  {formatMeetingTimestamp(cue.startMs)}
                </small>
              ) : null}
              {cue.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
