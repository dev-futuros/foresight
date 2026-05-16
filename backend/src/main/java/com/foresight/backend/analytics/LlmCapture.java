package com.foresight.backend.analytics;

import static com.foresight.backend.common.Constants.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.common.security.AuthenticatedUser;
import com.posthog.server.PostHogCaptureOptions;
import com.posthog.server.PostHogInterface;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Fires {@code $ai_generation} events to PostHog using the canonical LLM-analytics schema
 * from <a href="https://posthog.com/docs/llm-analytics/installation/manual-capture">posthog.com</a>.
 *
 * <p>Matches the property set the demo's client-side {@code captureLLMGeneration} emits, so
 * dashboards built against the demo work against the app too:
 * <ul>
 *   <li>{@code $ai_provider}, {@code $ai_model}, {@code $ai_input}, {@code $ai_output_choices}
 *   <li>{@code $ai_input_tokens}, {@code $ai_output_tokens}, {@code $ai_latency}
 *   <li>{@code $ai_http_status}, {@code $ai_is_error}, {@code $ai_error}, {@code $ai_stop_reason}
 *   <li>{@code $ai_trace_id}, {@code $ai_span_id}, {@code $ai_span_name}
 *   <li>{@code $ai_base_url}, {@code $ai_stream}
 *   <li>{@code $ai_cache_read_input_tokens}, {@code $ai_cache_creation_input_tokens}
 *   <li>{@code $ai_max_tokens}, {@code $ai_tools}
 *   <li>plus custom {@code feature} and {@code sources_count} for filtering inside PostHog
 * </ul>
 *
 * <p>When analytics is disabled (no PostHog bean registered), every method becomes a no-op —
 * callers never have to branch on configuration. Capture errors are caught and logged so a
 * PostHog outage never breaks the LLM flow.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LlmCapture {

    /** Optional so the service still works when {@code foresight.analytics.posthog.enabled=false}. */
    private final Optional<PostHogInterface> postHog;

    /**
     * Used to convert Jackson {@link JsonNode} trees into plain Java collections before
     * handing them to the PostHog SDK. PostHog's server SDK doesn't promise Jackson-aware
     * property serialization, so passing a raw JsonNode as a property value can produce
     * surprising output (an empty object, the node's internal field map, etc.) — convert
     * to Lists/Maps/primitives where we can.
     */
    private final ObjectMapper objectMapper;

    /**
     * Mint a UUID used to group multiple LLM calls under one PostHog trace (e.g. the 5
     * parallel analysis sections share a trace so the dashboard surfaces them together).
     */
    public String newTraceId() {
        return UUID.randomUUID().toString();
    }

    /**
     * Resolve the PostHog {@code distinct_id} for the current request. Uses the Kinde user id
     * when there's an authenticated principal — matches what the frontend's
     * {@code posthog.identify} call uses, so backend + frontend events group on the same
     * person. Falls back to {@code "anonymous"} for unauthenticated paths (e.g. public share
     * preview).
     */
    public String currentDistinctId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.isAuthenticated()
                && auth.getPrincipal() instanceof AuthenticatedUser user
                && user.externalUserId() != null
                && !user.externalUserId().isBlank()) {
            return user.externalUserId();
        }
        return "anonymous";
    }

    /**
     * Read the {@code X-PostHog-Session-Id} header forwarded by the frontend so the LLM event
     * we eventually capture stitches into the same PostHog session as the browser-side
     * pageviews / UI events. Null when the header is absent (e.g. unauthenticated public
     * paths, request originated outside the SPA) or RequestContextHolder hasn't been bound
     * yet (background tasks, tests).
     */
    public String currentSessionId() {
        try {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            String sid = attrs.getRequest().getHeader("X-PostHog-Session-Id");
            return (sid == null || sid.isBlank()) ? null : sid;
        } catch (Exception e) {
            return null;
        }
    }

    /** Build a per-call context with the bits the caller already knows; AiService fills the rest. */
    public LlmCaptureContext.LlmCaptureContextBuilder contextFor(String feature, String traceId) {
        return LlmCaptureContext.builder()
                .feature(feature == null ? "unknown" : feature)
                .distinctId(currentDistinctId())
                .sessionId(currentSessionId())
                .traceId(traceId == null ? newTraceId() : traceId)
                .spanId(newTraceId());
    }

    /**
     * Send one {@code $ai_generation} event to PostHog. Catches and logs every failure mode —
     * analytics must never break the actual LLM flow. No-op when the SDK isn't configured.
     */
    public void capture(LlmCaptureContext ctx) {
        if (postHog.isEmpty()) return;
        try {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("$ai_provider", "anthropic");
            props.put("$ai_model", ctx.model());
            props.put("$ai_input", buildInput(ctx));
            props.put("$ai_output_choices", buildOutputChoices(ctx));
            props.put("$ai_input_tokens", ctx.inputTokens() == null ? 0 : ctx.inputTokens());
            props.put("$ai_output_tokens", ctx.outputTokens() == null ? 0 : ctx.outputTokens());
            props.put("$ai_latency", ctx.latencyMs() / 1000.0);
            props.put("$ai_http_status", ctx.httpStatus() == null ? 0 : ctx.httpStatus());
            props.put("$ai_is_error", ctx.error() != null);
            props.put("$ai_error", ctx.error());
            props.put("$ai_trace_id", ctx.traceId());
            props.put("$ai_session_id", ctx.sessionId());
            props.put("$ai_span_id", ctx.spanId());
            props.put("$ai_span_name", ctx.feature());
            props.put("$ai_base_url", "https://api.anthropic.com");
            props.put("$ai_stream", ctx.streamed());
            if (ctx.maxTokens() != null) props.put("$ai_max_tokens", ctx.maxTokens());
            if (ctx.stopReason() != null) props.put("$ai_stop_reason", ctx.stopReason());
            if (ctx.tools() != null && !ctx.tools().isEmpty()) props.put("$ai_tools", ctx.tools());
            if (ctx.cacheReadTokens() != null) props.put("$ai_cache_read_input_tokens", ctx.cacheReadTokens());
            if (ctx.cacheCreationTokens() != null)
                props.put("$ai_cache_creation_input_tokens", ctx.cacheCreationTokens());

            // Custom dimensions outside the canonical schema — used for filter/cohort building.
            props.put("feature", ctx.feature());
            props.put("sources_count", ctx.sourcesCount());

            // PostHogCaptureOptions.Builder#property is annotated non-null on the value
            // arg and throws if we hand it a null. Several of our props legitimately CAN
            // be null on the success path ($ai_error, $ai_stop_reason if the stream
            // never emitted message_delta, etc.), so filter at the boundary — null in
            // PostHog land is conveyed by *absence* of the property, not by an explicit
            // null value.
            PostHogCaptureOptions.Builder options = PostHogCaptureOptions.builder();
            props.forEach((k, v) -> {
                if (v != null) options.property(k, v);
            });
            postHog.get().capture(ctx.distinctId(), "$ai_generation", options.build());
        } catch (Exception e) {
            // PostHog SDK promises not to throw, but defensive: never let analytics break an LLM call.
            log.warn("Failed to capture $ai_generation event for feature={}: {}", ctx.feature(), e.getMessage());
        }
    }

    private List<Map<String, Object>> buildInput(LlmCaptureContext ctx) {
        List<Map<String, Object>> input = new ArrayList<>();
        if (ctx.systemPrompt() != null && !ctx.systemPrompt().isBlank()) {
            input.add(Map.of(ROLE, "system", CONTENT, ctx.systemPrompt()));
        }
        if (ctx.messages() != null && !ctx.messages().isEmpty()) {
            input.addAll(ctx.messages());
        } else if (ctx.userPrompt() != null) {
            input.add(Map.of(ROLE, "user", CONTENT, ctx.userPrompt()));
        }
        return input;
    }

    /**
     * Build the {@code $ai_output_choices} array. Prefers Anthropic's structured content
     * (so PostHog's "tool calls" tab can surface {@code server_tool_use} / {@code tool_use}
     * blocks as function calls), falling back to plain text when only the accumulated string
     * is available (the streaming path before we re-walk the content blocks).
     *
     * <p>The JsonNode tree is converted to plain Java collections via {@code convertValue}
     * because we can't assume PostHog's SDK serializes JsonNode the way Jackson does — the
     * "tool calls" tab in PostHog only lights up when {@code $ai_output_choices[*].content}
     * is a real JSON array of objects, not a stringified one.
     */
    private List<Map<String, Object>> buildOutputChoices(LlmCaptureContext ctx) {
        JsonNode content = ctx.outputContent();
        if (content != null && content.isArray() && !content.isEmpty()) {
            Map<String, Object> choice = new HashMap<>();
            choice.put(ROLE, ASSISTANT);
            choice.put(CONTENT, objectMapper.convertValue(content, Object.class));
            return List.of(choice);
        }
        Map<String, Object> choice = new HashMap<>();
        choice.put(ROLE, ASSISTANT);
        choice.put(CONTENT, ctx.outputText() == null ? "" : ctx.outputText());
        return List.of(choice);
    }
}
