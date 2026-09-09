# Intelligence eval (Sprint 2)

Offline unit checks always run with `pnpm test`.

Live LLM eval (embed → summarize → ask goldens):

```bash
# Postgres + Redis up, .env configured for EMBEDDING_* and CHAT_*
export RUN_LLM_EVAL=1
pnpm --filter @stancehub/worker exec vitest run src/intelligence-eval.integration.test.ts
```

Goldens: `apps/worker/fixtures/intelligence-goldens.json` (greeting kickoff fixture).

Related: #30 Sprint 2 tests, #37 CI live LLM gate.
