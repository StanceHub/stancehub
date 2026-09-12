# Known gaps

Accepted limits in the current code. These are not bugs to paper over; generation tokens already stop an older attempt from overwriting a newer one. Tracked enterprise follow-ups also appear as GitHub issues (see “Issue index” below).

## Embed pipeline

### Crash between the status save and the queue write

**Mitigated by transactional outbox (#43 / migration `0007_job_outbox`).** Embed create/retry/reembed and summarize schedule insert a `job_outbox` row in the **same Postgres transaction** as the status/generation bump. Worker drains unpublished rows every 15s (and on boot before reconcile). Redis being down after commit no longer marks the meeting failed immediately — the meeting stays open until publish succeeds or outbox exhausts (20 attempts or 1h).

Residual: if an outbox row is already `published` but BullMQ lost the job while status is still open, reconcile performs **one** durable re-add (`reconcile_readd_at`), then fails the generation. Pre-outbox stuck `pending` rows (no outbox) still fail on reconcile until manual retry.

### Worker dies while the queue still thinks the job is running

The job stays `active` until BullMQ decides the lock is stale. During that window the meeting stays `embedding`, and retry correctly refuses to start a second attempt. When BullMQ gives up, the failed handler writes `failed` for that generation only.

There is no second timeout on our side. That would race the stall check and could mark a live attempt as failed.

## Search / retrieval

### Re-embed after chunk size changes

`CHUNK_MAX_CHARS` (default 480) controls transcript chunk size in the worker. Meetings embedded under a previous value keep old chunks until an admin runs **Re-embed all** (or per-meeting retry). Search quality for those meetings will not match new embeds until then.

### Org BM25 stats maintenance paths

`org_search_stats` (document count + total token length) and `org_term_df` (per-lexeme document frequency) power BM25 without scanning the whole org on every query.

They are updated when:

- the embed worker replaces a meeting’s chunks (under an org advisory lock), or
- an admin deletes a meeting (stats subtracted before the meeting row is removed).

Meeting delete takes the per-meeting `embed-retry` lock and `SELECT … FOR UPDATE` first, refuses open `pending`/`embedding` pipelines, and only then takes the org search stats lock for the mutate. Org delete cascades stats tables correctly. Any future path that inserts, updates, or deletes chunks outside those paths must call the same helpers, or keyword ranking will drift.

### Per-term DF table growth

`org_term_df` stores one row per distinct English lexeme seen in an org’s chunks. That is intentional: BM25 needs document frequency (`n_qi`) per term. For typical meeting vaults this stays small. Very large orgs may need pruning or a denser DF store later; correctness today depends on keeping the table in sync with chunks, not on scanning every chunk at query time.

## Intelligence (Sprint 2)

### Separate embedding vs chat hosts

Embeddings and chat resolve independently (`EMBEDDING_*` vs `CHAT_*`, with `LLM_*` migration fallbacks). See `docs/LLM-PROFILES.md`. Pointing a single shared host at a chat-only cloud model still breaks vault retrieval unless that host also serves the 768-d embed model.

### Ollama cloud chat via local OpenAI proxy

Supported path today: local Ollama daemon as OpenAI-compatible `/v1` proxy + `LLM_MODEL=gpt-oss:20b-cloud` (no local chat weights). Direct native `ollama.com` chat without that proxy is not implemented yet.

### Re-embed without re-summarize

Summaries and tasks snapshot `embed_generation` at summarize time. Re-embedding chunks does not auto-clear artifacts. Until a new summarize run completes, summary text/tasks may describe older chunk boundaries. Re-summarize runs automatically after each successful embed.

### Re-summarize resets tasks

A new summarize generation deletes and recreates meeting tasks from the fresh actions list. Task statuses (`done`, etc.) from the previous generation are not preserved.

### Summarize enqueue crash gap

**Mitigated by the same outbox (#43).** `scheduleMeetingSummary` bumps `summary_generation` and inserts outbox in one transaction; publish is best-effort after commit. Worker drain recovers unpublished summarize intents.

### No admin retry-summarize UI

Failed summarize leaves artifacts empty until another successful embed schedules summarize again (or a future admin retry action exists). Stuck `summary: running` after empty/`length` chat responses is addressed by same-generation resume claims, a higher summarize token budget (`SUMMARIZE_MAX_TOKENS`), and truncation-aware retries.

### Ask is single-turn

`POST /api/ask` does not persist conversation history. Multi-turn follow-ups are out of scope for the current stub.

### Ask has no application rate limits

Org membership gates access; there is no per-user / per-org request budget on ask or chat yet.

### Ask / summarize streaming

Chat completions are request/response only. No SSE/streaming to the UI.

### Citation deep-link UX

Ask UI is a stub: citations list meeting/chunk metadata but do not deep-link into a meeting player/transcript view with timestamp seek.

### Task assignees are hints

Summarize may emit assignee strings; tasks are not mapped to org member user ids.

### No live LLM eval in CI

Unit tests cover clients, resolvers, and citation helpers. Full ask/summarize quality against a live chat model is gated / manual (same class as embed integration).

### Per-tenant LLM credentials and quotas

Process env selects one embed profile and one chat profile for the deployment. Per-organization keys, spend caps, and model allow-lists are not implemented.

### Cross-encoder rerank

Fused BM25 + vector + RRF only. Dedicated rerank is Enterprise-tracked (#23).

### Observability

Search/ask emit structured console metrics (query length, counts, latency). Prometheus export and optional query-text logging are Sprint 3 / enterprise debug (#20, #21).

## Issue index (enterprise / durability follow-ups)

| Topic | Tracking |
|---|---|
| Cross-encoder rerank | #23 |
| Prometheus metrics | #20 |
| Optional `SEARCH_LOG_QUERY` | #21 |
| Sprint 3 hardening epic | #10 |
| Versioning, corrections, retention | #14 |
| Per-tenant LLM keys / quotas | #31 |
| Streaming ask/chat | #32 |
| Admin retry-summarize UI | #33 |
| Preserve task status across re-summarize | #34 |
| Ask conversation history | #35 |
| Ask rate limits | #36 |
| CI live LLM ask/summarize eval | #37 |
| Citation deep-links | #38 |
| Task assignees → org users | #39 (overlaps #29) |
| Native Ollama Cloud adapter | #40 |
| Audit trail for ask / summarize / tasks | #41 (overlaps #10 / #14) |
| Enterprise SSO / SCIM | #42 |
| Durable enqueue (outbox) for embed/summarize | #43 (outbox shipped; stall window remains) |
| Ask: show sources when model omits [n] | #44 |
| Ask over org tasks (status/assignee) | #45 |
| Backup / restore / DR runbook | #46 |
| CI Better Auth ↔ Drizzle schema drift | #47 |
| Stronger per-tenant isolation beyond org-row filters | #49 (CE fail-closed shipped — see `docs/TENANCY.md`; Enterprise RLS follow-up) |
| Documented embed/summarize enqueue crash gaps | mitigated by #43 outbox |
