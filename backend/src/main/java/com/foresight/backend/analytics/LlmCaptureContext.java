package com.foresight.backend.analytics;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.Builder;
import lombok.Singular;

/**
 * Per-call context for a single {@code $ai_generation} capture. Built by {@link com.foresight.backend.ai.AiService}
 * at the point where it knows which feature is running (e.g. {@code "analysis-section:A"}) and
 * passed to {@link LlmCapture#capture(LlmCaptureContext)} once the upstream call has settled
 * (success or error).
 *
 * <p>Mirrors the demo's client-side {@code captureLLMGeneration} payload — see {@code core/api.js}
 * in the demo repo — so dashboards filter the same way regardless of where the event originated.
 *
 * @param feature              short slug identifying which Foresight feature made the call
 *                             (e.g. {@code "analysis-section:A"}, {@code "suggest-steep:s"},
 *                             {@code "chat"}, {@code "steep-global:scan"})
 * @param distinctId           PostHog distinct id — Clerk user id when an authenticated user is
 *                             present, {@code "anonymous"} otherwise. The frontend's posthog-js
 *                             snippet identifies the same Clerk id, so backend + frontend events
 *                             group on the same person.
 * @param sessionId            PostHog session id forwarded by the browser via the
 *                             {@code X-PostHog-Session-Id} header on every {@code /api/ai/*} call.
 *                             Null when the frontend hasn't loaded PostHog yet or the request
 *                             didn't come from the SPA (e.g. a direct API hit). Maps onto
 *                             {@code $ai_session_id} so LLM events stitch into the same session
 *                             as the frontend pageviews/UI events captured by posthog-js.
 * @param traceId              shared id across multiple LLM calls of one logical flow (e.g. the
 *                             5 analysis sections fan out under one trace). UUID string.
 * @param spanId               unique id for this single call. UUID string.
 * @param model                Anthropic model identifier ({@code claude-opus-4-7}, …)
 * @param systemPrompt         system prompt sent to the model (kept for prompt-engineering review
 *                             in the PostHog trace viewer)
 * @param userPrompt           user-turn content. Provided as a string for the
 *                             single-turn flows; multi-turn flows (chat) populate {@link #messages}
 *                             instead.
 * @param messages             multi-turn conversation (chat). Mutually exclusive with
 *                             {@link #userPrompt} — set whichever applies.
 * @param tools                tool catalogue advertised to the model (e.g. the web_search spec)
 * @param maxTokens            {@code max_tokens} cap
 * @param latencyMs            wall-clock time from request start to response settle
 * @param httpStatus           upstream HTTP status (200 on success, anything else on error)
 * @param error                error message when the call failed, {@code null} on success
 * @param stopReason           Anthropic {@code stop_reason} value (e.g. {@code "end_turn"},
 *                             {@code "max_tokens"}, {@code "tool_use"})
 * @param inputTokens          {@code usage.input_tokens} reported by Anthropic
 * @param outputTokens         {@code usage.output_tokens}
 * @param cacheReadTokens      {@code usage.cache_read_input_tokens} (null when caching not in play)
 * @param cacheCreationTokens  {@code usage.cache_creation_input_tokens}
 * @param outputText           the accumulated assistant text (used when {@link #outputContent} is
 *                             not available — typically the streaming path before the structured
 *                             content blocks are assembled)
 * @param outputContent        Anthropic's structured content blocks ({@code type:"text"}/
 *                             {@code "tool_use"}/{@code "server_tool_use"}/…) verbatim. Preferred
 *                             over {@link #outputText} when present because PostHog's "tool calls"
 *                             view depends on the block shape.
 * @param sourcesCount         number of unique web_search citations harvested during the call
 * @param streamed             true when the response came over SSE, false for unary requests
 */
@Builder
public record LlmCaptureContext(
        String feature,
        String distinctId,
        String sessionId,
        String traceId,
        String spanId,
        String model,
        String systemPrompt,
        String userPrompt,
        @Singular List<Map<String, Object>> messages,
        @Singular List<Map<String, Object>> tools,
        Integer maxTokens,
        long latencyMs,
        Integer httpStatus,
        String error,
        String stopReason,
        Integer inputTokens,
        Integer outputTokens,
        Integer cacheReadTokens,
        Integer cacheCreationTokens,
        String outputText,
        JsonNode outputContent,
        int sourcesCount,
        boolean streamed) {}
