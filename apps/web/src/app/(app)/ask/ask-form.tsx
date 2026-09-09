"use client";

import { useState, type FormEvent } from "react";

type Citation = {
  meetingId: string;
  chunkId: string;
  meetingTitle?: string;
  quote: string;
  startMs?: number | null;
  endMs?: number | null;
};

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
      const data = (await res.json()) as {
        error?: string;
        answer?: string;
        citations?: Citation[];
        miss?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "ask failed");
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
          {pending ? "…" : "Ask"}
        </button>
      </form>
      {error ? <p>{error}</p> : null}
      {answer ? (
        <section style={{ marginTop: 16 }}>
          <h2>Answer</h2>
          {miss ? <p>
            <em>Miss</em>
          </p> : null}
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          <h3>Citations</h3>
          {citations.length === 0 ? (
            <p>No citations returned.</p>
          ) : (
            <ul>
              {citations.map((citation) => (
                <li key={citation.chunkId}>
                  <strong>{citation.meetingTitle ?? citation.meetingId}</strong>
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
