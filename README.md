# StanceHub (MVP)

Private MVP repository for **StanceHub** — self-hostable organizational meeting memory.

> **Status:** Sprint 0 scaffold. Private while company/IP setup is pending. Stub UI only (visual design later).

Canonical plan: [`StanceHub/stancehub-docs`](https://github.com/StanceHub/stancehub-docs) → `ARCHITECTURE-PLAN.md`, `MVP-ARCHITECTURE-AND-BOOTSTRAP.md`.

## Stack (locked)

| Layer | Choice |
|---|---|
| Language | TypeScript (pnpm monorepo + Turborepo) |
| App | Next.js + Better Auth |
| DB | PostgreSQL + pgvector |
| Queue | Redis + BullMQ |
| ORM | Drizzle |
| AI | Pure `@stancehub/ai` (stubs in Sprint 0) |
| Ship | Docker Compose (`db`, `redis`) |

## Quick start (Sprint 0)

```bash
# Node 20–24 (recommend 22). pnpm 9.15.x via packageManager / corepack.
cp .env.example .env
ln -sfn ../../.env apps/web/.env.local   # Next.js loads env from the app dir
pnpm install
pnpm compose:up          # containers: stancehub-postgres (:5433), stancehub-redis (:6379)
pnpm db:generate         # first time / after schema changes
pnpm db:migrate
# Optional Enterprise RLS: pnpm db:bootstrap-roles (existing volumes), then set TENANCY_RLS=1 + dual URLs — see docs/TENANCY.md
pnpm dev                 # web :3000 + worker
```

- Health: `GET http://localhost:3000/api/health` → `{ ok: true, checks: { database, redis } }`
- Sign up → creates org (Admin) → stub meetings list
- “Enqueue BullMQ ping” verifies the worker

> Postgres is mapped to host **5433** so it does not collide with a local Postgres on 5432.
## Layout

```text
apps/web/          Next.js UI + API + Better Auth
apps/worker/       BullMQ processors
packages/db/       Drizzle schema + migrations
packages/ai/       Pure AI helpers (stubs)
packages/shared/   zod / jobs / roles
packages/config/   shared tsconfig
deploy/            docker-compose.yml
```

## Contributing

See `CONTRIBUTING.md` and `docs/CLA.md` (CLA bot on PRs). Accepted limits: `docs/KNOWN-GAPS.md`. Embedding vs chat env: `docs/LLM-PROFILES.md`. Tenancy / RLS: `docs/TENANCY.md`.
