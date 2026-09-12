# Backup, restore, and DR (self-host Compose) (#46)

Guidance for the default **single-node** StanceHub stack (`deploy/docker-compose.yml`: Postgres on host **5433**, Redis on **6379**). Adjust paths/hosts for your deployment.

## What to back up

| Component | Required? | Notes |
|---|---|---|
| **Postgres** (`stancehub` DB) | **Yes** | Auth, orgs, meetings, transcripts, chunks/embeddings, tasks, outbox, audit, search stats |
| **Redis** | Optional | BullMQ queues only. Jobs are also durable in `job_outbox` — Redis loss is recoverable via worker drain/reconcile after DB restore |
| **`.env` / secrets** | **Yes** (offline, encrypted) | `BETTER_AUTH_SECRET`, DB passwords, API keys — not in the DB dump |
| Object/blob store | N/A today | Transcripts live in Postgres; no separate object storage in CE Compose |

## RPO / RTO (single-node Compose)

| Metric | Guidance |
|---|---|
| **RPO** (data loss tolerance) | Equal to backup interval. Daily dump ⇒ up to ~24h loss. For tighter RPO, run `pg_dump` hourly or continuous WAL archiving (not configured in default Compose). |
| **RTO** (time to recover) | Typical restore of a small/medium vault: **tens of minutes** (bring Compose up → restore dump → migrate if needed → restart web/worker). Large embedding tables take longer. |
| **Limits** | One Postgres volume, no automatic failover. Disk/host loss without off-box backups = total loss. |

## Backup procedure (Postgres)

From the machine that can reach Postgres (Compose maps `5433`):

```bash
# Example: timestamped logical backup (custom format, compressed)
mkdir -p backups
docker exec stancehub-postgres pg_dump -U stancehub -d stancehub -Fc -f /tmp/stancehub.dump
docker cp stancehub-postgres:/tmp/stancehub.dump "./backups/stancehub-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec stancehub-postgres rm -f /tmp/stancehub.dump
```

Plain SQL alternative:

```bash
docker exec stancehub-postgres pg_dump -U stancehub -d stancehub \
  | gzip > "./backups/stancehub-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

**Store copies off the Compose host** (S3, another disk, etc.). Encrypt backups that leave the machine.

### Optional Redis snapshot

Only needed if you must preserve in-flight BullMQ state exactly; otherwise skip.

```bash
docker exec stancehub-redis redis-cli BGSAVE
# then copy /data/dump.rdb from the redis volume if you mount it
```

## Restore drill (Postgres)

Practice this on a **non-production** volume first.

1. Stop app processes that write to the DB (`web`, `worker`). Leave Postgres up (or recreate empty DB).
2. Restore:

```bash
# Custom format
docker cp ./backups/stancehub-YYYYMMDD.dump stancehub-postgres:/tmp/restore.dump
docker exec stancehub-postgres pg_restore -U stancehub -d stancehub --clean --if-exists /tmp/restore.dump
```

For SQL gzip (**empty database only** — create/recreate DB first; this path has no `--clean`):

```bash
# Wipe and recreate (destructive) — example:
docker exec stancehub-postgres psql -U stancehub -d postgres -c \
  "DROP DATABASE IF EXISTS stancehub WITH (FORCE); CREATE DATABASE stancehub OWNER stancehub;"

gunzip -c ./backups/stancehub-YYYYMMDD.sql.gz \
  | docker exec -i stancehub-postgres psql -U stancehub -d stancehub
```

Prefer the custom-format `pg_restore --clean` path for restores onto an existing database.

3. If the dump is from an older revision, run `pnpm db:migrate` (admin URL when `TENANCY_RLS=1`).
4. If using Enterprise RLS, ensure `stancehub_app` exists (`pnpm db:bootstrap-roles`) and env dual URLs match `docs/TENANCY.md`.
5. Start web + worker. Hit `GET /api/health`. Confirm login, one meeting list, and worker drain (outbox recovers unpublished jobs).

### After restore

- Expect Redis queues to be empty or stale; worker outbox drain + reconcile should re-queue open embed/summarize work from Postgres.
- Re-check `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` if the hostname changed.

## Suggested schedule

| Environment | Postgres | Off-box copy |
|---|---|---|
| Dogfood / CE | Daily `pg_dump` | Yes |
| Trusted prod (single node) | ≥ hourly or daily + WAL later | Yes, with retention (e.g. 7–30 days) |

## Linked docs

- Compose: `deploy/docker-compose.yml`
- Tenancy / dual DB URLs: `docs/TENANCY.md`
- Known gaps index: `docs/KNOWN-GAPS.md` (#46)
