# Known gaps

Accepted limits in the current code. These are not bugs to paper over; the generation token already stops an older attempt from overwriting a newer one.

## Embed pipeline

### Crash between the status save and the queue write

A retry first commits the new `embed_generation` and sets the meeting to `pending`, then adds the Redis job.

If the web process dies in that gap, Postgres says `pending` and Redis has no job. The meeting stays there until the worker starts and marks that generation `failed`, or until someone retries. If Redis is down but the process stays up, the retry path writes `failed` immediately.

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
