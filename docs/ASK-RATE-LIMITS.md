# Ask rate limits (#36)

Application-level budgets for `POST /api/ask` to control LLM/retrieval cost and abuse.

## Behavior

- After auth + valid `q` + chat-config resolve, **before** `searchVault` / chat.
- Fixed-window Redis counters (default window **60s**).
- Dimensions (independent; both apply when set):
  - `ASK_RATE_LIMIT_USER_PER_MINUTE`
  - `ASK_RATE_LIMIT_ORG_PER_MINUTE`
- When both limits are set: user counter is checked first; if the user is over limit, the org counter is **not** incremented (avoids one noisy user burning the shared org budget).
- `0` or unset = that dimension disabled. Both disabled → no Redis calls.
- Exceeded → **429** `{ error: "rate limit exceeded" }` + `Retry-After`.
- Redis/config errors while limits enabled → **503** `{ error: "rate limit unavailable" }` (**fail-closed**).
- Throttle metric: `vault.ask.throttled` (org, scope, limit, count, retryAfterSec, windowSec — no query text).
- No audit row for 429 (noise).

## Keys

`ask:rl:{user|org}:{id}:{windowSec}:{bucket}`

Window size is part of the key so changing `ASK_RATE_LIMIT_WINDOW_SEC` does not reuse counters.

## Caveat

Fixed windows allow a short boundary burst (~2×). Token bucket can come later if needed.

## Env examples

```bash
# Recommended production starting point (commented in .env.example)
ASK_RATE_LIMIT_USER_PER_MINUTE=20
ASK_RATE_LIMIT_ORG_PER_MINUTE=100
# ASK_RATE_LIMIT_WINDOW_SEC=60
```
