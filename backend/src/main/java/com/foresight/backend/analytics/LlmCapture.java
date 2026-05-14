package com.foresight.backend.analytics;

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

import com.fasterxml.jackson.databind.JsonNode;
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
     * Mint a UUID used to group multiple LLM calls under one PostHog trace (e.g. the 5
     * parallel analysis sections share a trace so the dashboard surfaces them together).
     */
    public String newTraceId() {
        return UUID.randomUUID().toString();
    }

    /**
     * Resolve the PostHog {@code distinct_id} for the current request. Uses the Clerk user id
     * when there's an authenticated principal (matches what the frontend's {@code posthog.identify}
     * call uses, so backend + frontend events group on the same person). Falls back to
     * {@code "anonymous"} for unauthenticated paths (e.g. public share preview).
     */
    public String currentDistinctId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.isAuthenticated()
                && auth.getPrincipal() instanceof AuthenticatedUser user
                && user.clerkUserId() != null
                && !user.clerkUserId().isBlank()) {
            return user.clerkUserId();
        }
        return "anonymous";
    }

    /** Build a per-call context with the bits the caller already knows; AiService fills the rest. */
    public LlmCaptureContext.LlmCaptureContextBuilder contextFor(String feature, String traceId) {
        return LlmCaptureContext.builder()
                .feature(feature == null ? "unknown" : feature)
                .distinctId(currentDistinctId())
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
            props.put("$ai_span_id", ctx.spanId());
            props.put("$ai_span_name", ctx.feature());
            props.put("$ai_base_url", "https://api.anthropic.com");
            props.put("$ai_stream", ctx.streamed());
            if (ctx.maxTokens() != null) props.put("$ai_max_tokens", ctx.maxTokens());
            if (ctx.stopReason() != null) props.put("$ai_stop_reason", ctx.stopReason());
            if (ctx.tools() != null && !ctx.tools().isEmpty()) props.put("$ai_tools", ctx.tools());
            if (ctx.cacheReadTokens() != null) props.put("$ai_cache_read_input_tokens", ctx.cacheReadTokens());
            if (ctx.cacheCreationTokens() != null) props.put("$ai_cache_creation_input_tokens", ctx.cacheCreationTokens());

            // Custom dimensions outside the canonical schema — used for filter/cohort building.
            props.put("feature", ctx.feature());
            props.put("sources_count", ctx.sourcesCount());

            PostHogCaptureOptions.Builder options = PostHogCaptureOptions.builder();
            props.forEach(options::property);
            postHog.get().capture(ctx.distinctId(), "$ai_generation", options.build());
        } catch (Exception e) {
            // PostHog SDK promises not to throw, but defensive: never let analytics break an LLM call.
            log.warn("Failed to capture $ai_generation event for feature={}: {}", ctx.feature(), e.getMessage());
        }
    }

    private List<Map<String, Object>> buildInput(LlmCaptureContext ctx) {
        List<Map<String, Object>> input = new ArrayList<>();
        if (ctx.systemPrompt() != null && !ctx.systemPrompt().isBlank()) {
            input.add(Map.of("role", "system", "content", ctx.systemPrompt()));
        }
        if (ctx.messages() != null && !ctx.messages().isEmpty()) {
            input.addAll(ctx.messages());
        } else if (ctx.userPrompt() != null) {
            input.add(Map.of("role", "user", "content", ctx.userPrompt()));
        }
        return input;
    }

    /**
     * Build the {@code $ai_output_choices} array. Prefers Anthropic's structured content
     * (so PostHog's "tool calls" tab can surface {@code server_tool_use} / {@code tool_use}
     * blocks as function calls), falling back to plain text when only the accumulated string
     * is available (the streaming path before we re-walk the content blocks).
     */
    private List<Map<String, Object>> buildOutputChoices(LlmCaptureContext ctx) {
        JsonNode content = ctx.outputContent();
        if (content != null && content.isArray() && !content.isEmpty()) {
            Map<String, Object> choice = new HashMap<>();
            choice.put("role", "assistant");
            choice.put("content", content);
            return List.of(choice);
        }
        Map<String, Object> choice = new HashMap<>();
        choice.put("role", "assistant");
        choice.put("content", ctx.outputText() == null ? "" : ctx.outputText());
        return List.of(choice);
    }
}
