import { NextResponse } from "next/server";
import {
  createChatClient,
  isChatCompletionTruncatedError,
  resolveChatEndpoint,
} from "@stancehub/ai";
import { getProcessEnvRecord } from "@/env";
import { askWithChat, citationsFromAnswer, readAskMaxTokens } from "@/server/ask";
import {
  askRateLimitEnabled,
  consumeAskRateLimit,
  readAskRateLimitConfig,
} from "@/server/ask-rate-limit";
import { AUDIT_ACTIONS, AUDIT_OUTCOMES, recordAskAuditEvent } from "@/server/audit";
import { buildAskMessages } from "@stancehub/shared";
import { requireActiveOrg } from "@/server/org";
import { searchVault } from "@/server/search";
import { filterHitsForOrganization } from "@/server/tenancy-search";

export const runtime = "nodejs";

function logAskMetrics(fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ event: "vault.ask", ...fields }));
}

function logAskThrottled(fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ event: "vault.ask.throttled", ...fields }));
}

export async function POST(request: Request) {
  const started = performance.now();
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const organizationId = gate.access.organizationId;
  const userId = gate.access.session.user.id;

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

  let rateLimitConfig;
  try {
    rateLimitConfig = readAskRateLimitConfig(getProcessEnvRecord());
  } catch {
    return NextResponse.json({ error: "rate limit unavailable" }, { status: 503 });
  }

  if (askRateLimitEnabled(rateLimitConfig)) {
    let decision;
    try {
      decision = await consumeAskRateLimit({
        userId,
        organizationId,
        config: rateLimitConfig,
      });
    } catch (error) {
      console.error("[ask.rate_limit]", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "rate limit unavailable" }, { status: 503 });
    }
    if (!decision.allowed) {
      logAskThrottled({
        organizationId,
        scope: decision.scope,
        limit: decision.limit,
        count: decision.count,
        retryAfterSec: decision.retryAfterSec,
        windowSec: decision.windowSec,
      });
      return NextResponse.json(
        { error: "rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(decision.retryAfterSec) },
        },
      );
    }
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
      const totalMs = Math.round(performance.now() - started);
      logAskMetrics({
        organizationId,
        queryLength: query.length,
        hitCount: 0,
        citationCount: 0,
        miss: true,
        totalMs,
        error: false,
      });
      await recordAskAuditEvent({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.askMiss,
        outcome: AUDIT_OUTCOMES.miss,
        query,
        metadata: { queryLength: query.length, hitCount: 0, citationCount: 0, totalMs },
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
    const totalMs = Math.round(performance.now() - started);
    logAskMetrics({
      organizationId,
      queryLength: query.length,
      hitCount: hits.length,
      citationCount: citations.length,
      miss: false,
      totalMs,
      error: false,
    });
    await recordAskAuditEvent({
      organizationId,
      userId,
      action: AUDIT_ACTIONS.askCompleted,
      outcome: AUDIT_OUTCOMES.success,
      query,
      metadata: {
        queryLength: query.length,
        hitCount: hits.length,
        citationCount: citations.length,
        totalMs,
      },
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
    const totalMs = Math.round(performance.now() - started);
    logAskMetrics({
      organizationId,
      queryLength: query.length,
      hitCount,
      citationCount: 0,
      miss: false,
      totalMs,
      error: true,
    });
    await recordAskAuditEvent({
      organizationId,
      userId,
      action: AUDIT_ACTIONS.askFailed,
      outcome: AUDIT_OUTCOMES.failure,
      query,
      metadata: {
        queryLength: query.length,
        hitCount,
        citationCount: 0,
        totalMs,
        errorClass: isChatCompletionTruncatedError(error) ? "truncated" : "error",
      },
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
