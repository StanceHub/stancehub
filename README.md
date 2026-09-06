# StanceHub (MVP)

Private MVP repository for **StanceHub** — self-hostable organizational meeting memory.

> **Status:** Private while company/IP setup is pending. Not a public open-source launch yet.

## What we are building (v1)

Upload / paste meeting transcripts → vault → **cited Q&A** → summaries + action items → basic tasks → Docker Compose self-host.

Canonical product plan and detailed stack decisions live only in the private docs repo: [`StanceHub/stancehub-docs`](https://github.com/StanceHub/stancehub-docs) (`ARCHITECTURE-PLAN.md`, `MVP-ARCHITECTURE-AND-BOOTSTRAP.md`, `STACK-DECISIONS-DETAILED.md`). Do not copy planning docs into this code repo.

## Stack (locked)

| Layer | Choice |
|---|---|
| Language | TypeScript (pnpm monorepo + thin Turborepo) |
| App | Next.js + Better Auth |
| DB | PostgreSQL + pgvector |
| Queue | Redis + BullMQ |
| ORM | Drizzle |
| AI | Pure `packages/ai` |
| LLM | OpenAI-compatible API |
| Ship | Docker Compose (`web`, `worker`, `db`, `redis`) |

## Repo layout

```text
apps/web/          # Next.js UI + API
apps/worker/       # embed / summarize jobs
packages/db/       # Drizzle schema + migrations
packages/ai/       # chunk, retrieve, cite, summarize
packages/shared/   # shared types
deploy/            # docker-compose
docs/              # contributor / CLA notes
```

## Getting started

Implementation starts in Sprint 0. Until then this repo holds governance + scaffolding.

```bash
# later, after Sprint 0 lands:
pnpm install
docker compose -f deploy/docker-compose.yml up
```

## Contributing (private team)

1. Read `CONTRIBUTING.md` and `docs/CLA.md`
2. Work on a branch; open a PR into `main`
3. `CODEOWNERS` requires review from `@StanceHub/owners`

## License

Copyright © StanceHub contributors.  
**All rights reserved for now** (private MVP).  
Public Community Edition is planned as **AGPLv3** only after IP/company decisions are settled — see docs repo.
