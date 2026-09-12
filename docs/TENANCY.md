# Tenancy and RBAC

## Isolation model

| Tier | Enforcement | Bar |
|---|---|---|
| **Community Edition (CE)** | Application-level fail-closed `organizationId` scoping + mandatory cross-org tests. After migrate, vault tables have FORCE RLS; CE may run with `TENANCY_RLS=0` and a **BYPASSRLS / superuser** `DATABASE_URL` (local docker `stancehub`). | #49 CE path |
| **Enterprise** | CE controls **plus** dual DB URLs, `TENANCY_RLS=1`, non-bypass app role, and org-scoped `SET LOCAL` on vault queries | #49 PR2 — this document |

Session tenancy key: Better Auth `session.activeOrganizationId`, validated by a matching `member` row. Missing or non-member active org → fail closed (no unscoped queries).

Worker processors assert meeting/transcript `organizationId` matches the job payload. Org mismatch is a **terminal failure** (not a silent success) for both embed and summarize.

## Enterprise RLS (`TENANCY_RLS=1`)

After migration `0008_tenancy_rls`, vault tables always have **ENABLE + FORCE RLS**. Policies deny rows when `app.organization_id` is missing/empty.

| Variable | Role |
|---|---|
| `DATABASE_URL` | Web / app role (`stancehub_app`): **NOSUPERUSER**, **NOBYPASSRLS**. Web **must not** use the admin URL. |
| `DATABASE_URL_ADMIN` | Migrate + worker (superuser or BYPASSRLS). **Required** when `TENANCY_RLS=1`. |
| `TENANCY_RLS` | `1` = require admin URL for migrate/worker; refuse bypass on app pool (awaited via `ensureAppDbRole` / health); refuse non-bypass on worker/migrate admin URL; web publish uses short scoped DB windows. `0` = CE (single bypass URL ok). |

App role grants are limited to Better Auth tables **plus** vault tables (migration `0009`). Auth tables stay **without** RLS so membership checks work on the same `DATABASE_URL`.

Vault tables with policies (auth / Better Auth tables are **not** RLS’d):

`meetings`, `transcripts`, `chunks`, `meeting_artifacts`, `tasks`, `job_outbox`, `org_search_stats`, `org_term_df`

Policy: `organization_id = nullif(current_setting('app.organization_id', true), '')` — missing/empty GUC → **0 rows** (fail closed).

Role bootstrap (passwords **not** in migration SQL): `deploy/postgres/docker-entrypoint-initdb.d/01-roles.sql` on fresh compose volumes. **Existing volumes must run `pnpm db:bootstrap-roles` before migrate** — migration `0008` fails closed if `stancehub_app` is missing.

`withOrgScope` always sets `SET LOCAL app.organization_id` for vault mutations/reads (harmless under a bypass role). Search scopes **DB only**; embedding HTTP and Redis outbox publish stay outside the RLS transaction. Retry/delete may still call Redis while holding an advisory **xact** lock (intentional race control).

## Route × role matrix

| Capability | Member | Admin / Owner |
|---|---|---|
| Upload meeting / create | yes | yes |
| Search vault | yes | yes |
| Ask (cited Q&A) | yes | yes |
| List / update task status | yes | yes |
| Delete meeting | no | yes |
| Retry embed | no | yes |
| Re-embed all | no | yes |

`owner` is treated as admin for privileged vault mutations (`isAdmin` in `@stancehub/shared`).

## Cross-org behavior

- Resource lookups always include `organizationId` from the active org session.
- Cross-org or missing resources return the **same** HTTP **404** body (`{ error: "not found" }`) — no existence oracle.
- Search and ask retrieve only chunks scoped to the session org (DB helpers require `organizationId`).
- With `TENANCY_RLS=1`, Postgres also denies cross-org rows even if an app bug omits the filter.

## Follow-ups

- Audit trail — #41
- SSO / SCIM — #42
