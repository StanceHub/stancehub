# Contributing to StanceHub (private MVP)

This repository is **private**. Only organization members should contribute.

## Before you contribute

1. You must be a member of the [StanceHub](https://github.com/StanceHub) GitHub organization.
2. Enable **2FA** on your GitHub account (required by org policy).
3. Read and agree to the [Contributor License Agreement](./docs/CLA.md). On your first PR, sign via the CLA bot by commenting: `I have read the CLA Document and I hereby sign the CLA`.
4. Follow the locked plan in `StanceHub/stancehub-docs` → `ARCHITECTURE-PLAN.md` / `MVP-AND-STACK.md`.

## How to work

1. Create a branch from `main`: `feat/...`, `fix/...`, or `chore/...`
2. Keep PRs small and aligned with the **MUST** MVP list
3. Do **not** add LATER features (desktop capture, bots, Kanban, MCP) without agreement
4. Open a pull request into `main`
5. Pass the **CLA Assistant** check (and wait for review from `@StanceHub/owners`)

## Dependency updates

Dependabot opens weekly PRs for npm (pnpm workspace) and GitHub Actions. Review like any other PR; majors are ignored automatically until we opt in.

## PR checklist

- [ ] Scope matches v1 MUST list
- [ ] No secrets committed (`.env`, API keys)
- [ ] `docker compose` still boots if you touch deploy/runtime
- [ ] Cited answers still return sources if you touch QA/RAG
- [ ] CLA signed via bot (first-time) / already on file

## Questions

Ask in the owners team / project chat. Do not expand public marketing or publish this repo yet.
