# Known gaps

Accepted limits in the current code. These are not bugs to paper over; the generation token already stops an older attempt from overwriting a newer one.

## Embed pipeline

### Crash between the status save and the queue write

A retry first commits the new `embed_generation` and sets the meeting to `pending`, then adds the Redis job.

If the web process dies in that gap, Postgres says `pending` and Redis has no job. The meeting stays there until the worker starts and marks that generation `failed`, or until someone retries. If Redis is down but the process stays up, the retry path writes `failed` immediately.

### Worker dies while the queue still thinks the job is running

The job stays `active` until BullMQ decides the lock is stale. During that window the meeting stays `embedding`, and retry correctly refuses to start a second attempt. When BullMQ gives up, the failed handler writes `failed` for that generation only.

There is no second timeout on our side. That would race the stall check and could mark a live attempt as failed.
