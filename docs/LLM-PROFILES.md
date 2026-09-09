# LLM profiles (embeddings vs chat)

StanceHub follows the industry pattern of **separate retrieval embeddings and generative chat**. One shared base URL only works when a single OpenAI-compatible host serves both models.

## Resolution

Shared helpers live in `@stancehub/ai` (`resolveEmbeddingEndpoint`, `resolveChatEndpoint`). Web and worker both use them so search/ask cannot drift from embed/summarize.

### Embeddings (vault)

| Variable | Role |
|---|---|
| `EMBEDDING_BASE_URL` | Preferred embed host (`…/v1`) |
| `EMBEDDING_API_KEY` | Preferred embed key |
| `EMBEDDING_MODEL` | Required |
| `EMBEDDING_DIMENSIONS` | Default `768`; worker requires schema width |
| `LLM_BASE_URL` / `LLM_API_KEY` | Fallback only when `EMBEDDING_*` URL/key unset |

### Chat (summarize / ask)

| Variable | Role |
|---|---|
| `CHAT_BASE_URL` | Preferred chat host (`…/v1`) |
| `CHAT_API_KEY` | Preferred chat key |
| `OLLAMA_API_KEY` | Key fallback after `CHAT_API_KEY`, before `LLM_API_KEY` |
| `LLM_MODEL` | Required chat model id |
| `CHAT_TIMEOUT_MS` | Preferred timeout (default **120000**) |
| `LLM_CHAT_TIMEOUT_MS` | Timeout fallback |
| `SUMMARIZE_MAX_TOKENS` | Summarize completion budget (default **4096**, max **8192**) |
| `ASK_MAX_TOKENS` | Ask completion budget (default **2048**, max **8192**; one bump on truncation) |
| `LLM_BASE_URL` / `LLM_API_KEY` | Fallback only when `CHAT_*` unset |

## Recommended local dogfood (Model A — Ollama cloud chat)

No local **chat** weights. Local Ollama acts as an OpenAI-compatible **proxy**; `gpt-oss:20b-cloud` runs remotely after `ollama signin` and `ollama pull gpt-oss:20b-cloud`.

```bash
# Embeddings — keep your existing 768-d OpenAI-compatible endpoint
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1   # or another embed host
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=embed
EMBEDDING_DIMENSIONS=768

# Chat — Ollama daemon /v1 → cloud model (no local chat weights)
CHAT_BASE_URL=http://127.0.0.1:11434/v1
CHAT_API_KEY=ollama
LLM_MODEL=gpt-oss:20b-cloud
CHAT_TIMEOUT_MS=120000
```

Do **not** point embeddings at a chat-only cloud host unless that host also serves your exact 768-d embed model.

## Direct `ollama.com` without a local proxy

Native cloud chat (`POST https://ollama.com/api/chat`) is **not** wired yet. Tracked as an enterprise follow-up. Until then, use the local Ollama OpenAI `/v1` proxy above (still no local chat weights).

## Migration note

Older installs that set only `LLM_BASE_URL` + `LLM_API_KEY` for both continue to work until you split hosts. Prefer `EMBEDDING_*` + `CHAT_*` as soon as chat and embed differ.
