import { NextResponse } from "next/server";
import {
  createChatClient,
  isChatCompletionTruncatedError,
  resolveChatEndpoint,
} from "@stancehub/ai";
import { getProcessEnvRecord } from "@/env";
import { askWithChat, citationsFromAnswer, readAskMaxTokens } from "@/server/ask";
import { buildAskMessages } from "@stancehub/shared";
import { requireActiveOrg } from "@/server/org";
import { searchVault } from "@/server/search";
import { filterHitsForOrganization } from "@/server/tenancy-search";

function logAskMetrics(fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ event: "vault.ask", ...fields }));
}

export async function POST(request: Request) {
  const started = performance.now();
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const organizationId = gate.access.organizationId;

  let body: { q?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as { q?: unknown; limit?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const query = typeof body.q === "string" ? body.q.trim() : "";
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(12, Math.max(1, Math.floor(body.limit)))
      : 8;

  let chat;
  try {
    chat = resolveChatEndpoint(getProcessEnvRecord());
  } catch {
    return NextResponse.json(
      {
        error:
          "chat endpoint is not configured (LLM_MODEL and CHAT_BASE_URL/LLM_BASE_URL + CHAT_API_KEY/OLLAMA_API_KEY/LLM_API_KEY)",
      },
      { status: 503 },
    );
  }

  let hitCount = 0;
  try {
    const retrieval = await searchVault({
      organizationId,
      query,
      limit,
      mode: "both",
    });
    const hits = filterHitsForOrganization(retrieval.fused, organizationId);
    hitCount = hits.length;
    if (hits.length === 0) {
      logAskMetrics({
        organizationId,
        queryLength: query.length,
        hitCount: 0,
        citationCount: 0,
        miss: true,
        totalMs: Math.round(performance.now() - started),
        error: false,
      });
      return NextResponse.json({
        ok: true,
        miss: true,
        answer: "I could not find that in the vault.",
        citations: [],
        retrievalErrors: {
          keywordError: retrieval.keywordError,
          vectorError: retrieval.vectorError,
        },
      });
    }

    const client = createChatClient({
      baseUrl: chat.baseUrl,
      apiKey: chat.apiKey,
      model: chat.model,
      timeoutMs: chat.timeoutMs,
    });
    const maxTokens = readAskMaxTokens(getProcessEnvRecord());
    const content = await askWithChat({
      client,
      messages: buildAskMessages(query, hits),
      maxTokens,
      organizationId,
      queryLength: query.length,
    });
    const citations = citationsFromAnswer(content, hits);
    logAskMetrics({
      organizationId,
      queryLength: query.length,
      hitCount: hits.length,
      citationCount: citations.length,
      miss: false,
      totalMs: Math.round(performance.now() - started),
      error: false,
    });
    return NextResponse.json({
      ok: true,
      miss: false,
      answer: content,
      citations,
      retrievalErrors: {
        keywordError: retrieval.keywordError,
        vectorError: retrieval.vectorError,
      },
    });
  } catch (error) {
    console.error("[ask]", error instanceof Error ? error.message : error);
    logAskMetrics({
      organizationId,
      queryLength: query.length,
      hitCount,
      citationCount: 0,
      miss: false,
      totalMs: Math.round(performance.now() - started),
      error: true,
    });
    if (isChatCompletionTruncatedError(error)) {
      return NextResponse.json(
        { error: "ask model ran out of completion tokens; try a shorter question or raise ASK_MAX_TOKENS" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "ask failed" }, { status: 500 });
  }
}
