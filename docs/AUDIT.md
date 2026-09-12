# Audit trail (#41)

Durable, org-scoped events for ask, summarize, and task mutations.

## Events

| Action | Actor | When |
|---|---|---|
| `ask.completed` / `ask.miss` / `ask.failed` | user | After ask outcome (fail-soft insert) |
| `summarize.succeeded` / `summarize.failed` | worker | Same txn as status mutation |
| `task.bulk_replaced` | worker | Same txn as summarize success (task create/wipe) |
| `task.status_changed` | user | Same txn as `PATCH /api/tasks/:id` when status changes |

## Privacy

- CE default: **no** ask query text (`query_text` null). Metadata keeps `queryLength`, hit/citation counts, timings.
- Enterprise opt-in: `AUDIT_STORE_QUERY_TEXT=1` stores at most **80** characters (same bound as `SEARCH_LOG_QUERY` / #21).
- Never store prompts, transcripts, model answers, or full error blobs (failure reasons truncated).

## Failure policy

- **Ask:** audit insert is best-effort; ask response never fails because of audit.
- **Summarize success + task status change:** audit is in the **same Postgres transaction** as the mutation (fail-hard together).
- **`markSummaryFailed`:** status update + audit in one transaction.

## Tenancy / grants

`audit_events` is a vault table: FORCE RLS + `app.organization_id` policy. App role has **SELECT, INSERT only** — no UPDATE/DELETE (append-oriented). Time-based retention purge is **#14** and must use admin/BYPASSRLS; org delete cascades via `organization_id`.

Index `(organization_id, created_at)` is present so #14 can purge without a schema redo.

## Out of scope (PR1)

- Admin GET/list UI
- Upload / delete / retry audit (action strings remain extensible)
- Retention job (#14)
