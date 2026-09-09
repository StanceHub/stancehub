# Sprint 2 — Cited answers and ranking (plan)

This is the working plan for Sprint 2 intelligence on top of the current BM25 + vector + RRF vault. It is not an implementation checklist for this PR.

## Cited answers (ship this sprint)

**Goal:** Answer a natural-language question with short prose and **inline citations** back to meeting chunks (meeting title, timestamp when present, chunk snippet).

**Recommended shape:**

1. Retrieve with existing `searchVault` fused results (`limit` 6–12).
2. Pass top chunks to a chat LLM (OpenAI-compatible `CHAT_*` / `LLM_MODEL`; see `docs/LLM-PROFILES.md`) with a strict cite format (`[n]` → chunk id).
3. Refuse to invent facts not in the retrieved chunks; if retrieval is empty, say so.
4. Persist nothing until we add conversation history (optional later).

**API sketch:** `POST /api/ask` with `{ q }` → `{ answer, citations: [{ chunkId, meetingId, meetingTitle, startMs, endMs, excerpt }] }`.

**Acceptance:** Sample VTT goldens answer correctly with citations pointing at the decision sentences; empty vault returns a clear miss; org isolation unchanged.

## Reranker (decide, then implement)

RRF is good enough to ship cited answers. A reranker improves precision when keyword and vector disagree.

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Cross-encoder / local rerank model** | Strong ranking, stays self-hostable | Extra model + latency | Best long-term for self-host CE |
| **LLM listwise rerank** | Uses existing chat endpoint | Cost/latency; weaker than dedicated cross-encoder at scale | Acceptable interim |
| **Skip / stay on RRF** | Zero new moving parts | Hit@1 plateaus on hard queries | OK until cited-answer eval proves need |

**Recommendation:** Ship cited answers on RRF first. Add a **local cross-encoder rerank** of the fused top-N only if Sprint 2 eval shows citation misses that ranking (not chunking) caused. Do not add a second embed model for reranking.

## Observability follow-ups (tracked as issues)

- Prometheus / dashboard metrics for search and ask latency, hit counts, errors.
- Opt-in query-text logging for enterprise debug (`SEARCH_LOG_QUERY`); default remains query length only.
