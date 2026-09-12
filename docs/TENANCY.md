# Tenancy and RBAC (CE)

## Isolation model

| Tier | Enforcement | Bar |
|---|---|---|
| **Community Edition (CE)** | Application-level fail-closed `organizationId` scoping + mandatory cross-org tests | Ship criterion for #49 CE path |
| **Enterprise** | CE controls **plus** Postgres RLS (or stronger) on vault tables with a non-bypass app DB role | Tracked as follow-up (#49 Enterprise / Sprint 3); not required for CE dogfood |

CE does **not** rely on Postgres RLS at runtime. Enterprise production **must** (see #49).

Session tenancy key: Better Auth `session.activeOrganizationId`, validated by a matching `member` row. Missing or non-member active org → fail closed (no unscoped queries).

Worker processors assert meeting/transcript `organizationId` matches the job payload. Org mismatch is a **terminal failure** (not a silent success) for both embed and summarize.

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

## Follow-ups

- Postgres RLS + dual DB URLs + CI with RLS on — Enterprise half of #49
- Audit trail — #41
- SSO / SCIM — #42
