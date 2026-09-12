"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { meetingPath, type Citation } from "@stancehub/shared";
import { MarkdownAnswer } from "./markdown-answer";

export function AskForm() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [miss, setMiss] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setMiss(false);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const retryAfter = res.headers.get("Retry-After");
      const data = (await res.json()) as {
        error?: string;
        answer?: string;
        citations?: Citation[];
        miss?: boolean;
      };
      if (!res.ok) {
        const base = data.error ?? "ask failed";
        if (res.status === 429 && retryAfter) {
          setError(`${base} (retry after ${retryAfter}s)`);
        } else {
          setError(base);
        }
        return;
      }
      setAnswer(data.answer ?? "");
      setCitations(data.citations ?? []);
      setMiss(Boolean(data.miss));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ask failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="What did we decide about share links?"
          aria-label="Question"
        />
        <button type="submit" disabled={pending || !q.trim()}>
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {answer ? (
        <section style={{ marginTop: 16 }}>
          <h2>Answer</h2>
          {miss ? (
            <p>
              <em>Miss</em>
            </p>
          ) : null}
          <MarkdownAnswer source={answer} citations={citations} />
          <h3>Citations</h3>
          {citations.length === 0 ? (
            <p>No citations returned.</p>
          ) : (
            <ul>
              {citations.map((citation) => (
                <li
                  key={`${citation.n}-${citation.chunkId}`}
                  id={`cite-${citation.n}`}
                  tabIndex={-1}
                  style={{ marginBottom: 12 }}
                >
                  <strong>[{citation.n}]</strong>{" "}
                  <Link href={meetingPath(citation.meetingId, { tMs: citation.startMs })}>
                    {citation.meetingTitle ?? citation.meetingId}
                  </Link>
                  {citation.startMs != null || citation.endMs != null
                    ? ` (${citation.startMs ?? "?"}-${citation.endMs ?? "?"}ms)`
                    : null}
                  <div>{citation.quote}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
