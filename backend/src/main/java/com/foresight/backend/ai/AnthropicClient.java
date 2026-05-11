package com.foresight.backend.ai;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

/**
 * Thin transport wrapper around the Anthropic Messages API.
 *
 * <p>Returns a {@link Mono} so cancellation propagates end-to-end: when the inbound HTTP
 * client disconnects, Spring cancels the response Mono, reactor-netty closes the upstream
 * socket to Anthropic, and the model stops generating (token billing stops with it). The
 * earlier {@code .block()} flow defeated this — calls would run to completion even after
 * the user closed the tab.
 *
 * <p>Retry strategy:
 * <ul>
 *   Retries on IO errors and HTTP 5xx (upstream blips that a retry can fix).</li>
 *   Does NOT retry 4xx — including {@code 429 Too Many Requests}. Retrying 429 just
 *       walks deeper into the same rate-limit pit on lower tiers; let the caller decide
 *       when to ask the user to try again.</li>
 *   <li>Honours the upstream {@code Retry-After} header when present; otherwise uses
 *       exponential backoff from {@code retry-backoff}, up to {@code max-retries} attempts.</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnthropicClient {

    private final WebClient anthropicWebClient;
    private final AnthropicProperties properties;

    /**
     * Server-side {@code web_search} tool spec. Anthropic resolves searches inside the
     * model loop and returns interleaved {@code web_search_tool_use} /
     * {@code web_search_tool_result} blocks alongside the final {@code text} blocks.
     *
     * Each search counts toward the workspace rate limits. {@code max_uses} is the
     * trade-off knob: lower → fewer rate-limit hits on small tiers; higher → richer
     * grounding for the final answer.
     */
    private static final List<Map<String, Object>> WEB_SEARCH_TOOLS =
            List.of(Map.of("type", "web_search_20250305", "name", "web_search", "max_uses", 5));

    /**
     * Sends a single-turn request to Anthropic's {@code /v1/messages} endpoint.
     *
     * @param model        Anthropic model identifier (e.g. {@code claude-haiku-4-5-20251001}).
     *                     Callers pick the tier from {@code AnthropicProperties.haiku()/sonnet()/opus()}.
     * @param systemPrompt the system instruction (sets the model's role/format constraints)
     * @param userPrompt   the user's turn content
     * @param maxTokens    upper bound on response length; pick generously for long outputs
     * @return a Mono that emits the raw JSON response from Anthropic
     */
    public Mono<JsonNode> sendMessage(
            String model, String systemPrompt, String userPrompt, int maxTokens) {
        return doSend(model, systemPrompt, userPrompt, maxTokens, null);
    }

    /**
     * Same as {@link #sendMessage} but enables Anthropic's server-side {@code web_search} tool
     * so the model can ground its answer on live data. The response may contain interleaved
     * {@code tool_use}/{@code tool_result} blocks — callers should filter content by
     * {@code type == "text"} before parsing.
     */
    public Mono<JsonNode> sendMessageWithWebSearch(
            String model, String systemPrompt, String userPrompt, int maxTokens) {
        return doSend(model, systemPrompt, userPrompt, maxTokens, WEB_SEARCH_TOOLS);
    }

    private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE_STRING =
            new ParameterizedTypeReference<>() {};

    /**
     * Streaming variant of {@link #sendMessageWithWebSearch}. POSTs to
     * {@code /v1/messages} with {@code stream: true} and forwards the
     * upstream SSE flow as {@link ServerSentEvent} objects whose
     * {@code event()} carries the Anthropic event name and {@code data()}
     * carries the raw JSON payload. Caller accumulates text deltas and
     * harvests {@code web_search_tool_result} blocks.
     *
     * <p>Streams are intentionally NOT retried: replaying events the
     * frontend already consumed would surface stale character counts.
     */
    public Flux<ServerSentEvent<String>> streamMessageWithWebSearch(
            String model, String systemPrompt, String userPrompt, int maxTokens) {
        return streamRaw(model, systemPrompt, userPrompt, maxTokens, WEB_SEARCH_TOOLS);
    }

    /**
     * Streaming variant of {@link #sendMessage} — no tools. Same SSE
     * contract as {@link #streamMessageWithWebSearch} but without the
     * web_search tool loop, so the upstream emits only text deltas
     * (no {@code web_search_tool_result} blocks). Used by the Global
     * STEEP per-dimension reformulation flow and the 5 analyze section
     * calls, which both stream plain prose / JSON under shared research.
     */
    public Flux<ServerSentEvent<String>> streamMessage(
            String model, String systemPrompt, String userPrompt, int maxTokens) {
        return streamRaw(model, systemPrompt, userPrompt, maxTokens, null);
    }

    private Flux<ServerSentEvent<String>> streamRaw(
            String model, String systemPrompt, String userPrompt, int maxTokens,
            List<Map<String, Object>> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        body.put("system", systemPrompt);
        body.put("messages", List.of(Map.of("role", "user", "content", userPrompt)));
        body.put("stream", true);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }

        return anthropicWebClient
                .post()
                .uri("/v1/messages")
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(SSE_STRING)
                .doOnCancel(() -> log.info("Anthropic stream cancelled by downstream subscriber"))
                .onErrorResume(WebClientResponseException.class, e -> {
                    log.error("Anthropic stream error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
                    return Flux.error(new AiException("AI provider error: " + e.getStatusCode()));
                })
                .onErrorResume(t -> !(t instanceof AiException), t -> {
                    log.error("Anthropic stream failed: {}", t.getMessage(), t);
                    return Flux.error(new AiException("AI provider unavailable"));
                });
    }

    /**
     * Multi-turn variant for the chat assistant. Accepts a pre-built messages list
     * (oldest-first) and an arbitrary tools catalogue, so callers can hand the model
     * a conversation in flight along with any custom tools they want it to be able
     * to invoke.
     *
     * <p>The response shape is identical to {@link #sendMessage}; callers iterate
     * the {@code content} blocks looking for {@code text} and {@code tool_use}.
     *
     * @param systemPrompt sets the assistant's role + tool-use rules
     * @param messages     oldest-first turn list, each entry already in Anthropic's wire shape
     * @param tools        custom tool catalogue declared to the model
     * @param maxTokens    upper bound on response length
     */
    public Mono<JsonNode> sendConversation(
            String model,
            String systemPrompt,
            List<? extends Object> messages,
            List<Map<String, Object>> tools,
            int maxTokens) {
        return doSendRaw(model, systemPrompt, messages, maxTokens, tools);
    }

    private Mono<JsonNode> doSend(
            String model, String systemPrompt, String userPrompt, int maxTokens,
            List<Map<String, Object>> tools) {
        return doSendRaw(
                model,
                systemPrompt,
                List.of(Map.of("role", "user", "content", userPrompt)),
                maxTokens,
                tools);
    }

    private Mono<JsonNode> doSendRaw(
            String model,
            String systemPrompt,
            List<? extends Object> messages,
            int maxTokens,
            List<Map<String, Object>> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        body.put("system", systemPrompt);
        body.put("messages", messages);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }

        return anthropicWebClient
                .post()
                .uri("/v1/messages")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .retryWhen(retryPolicy())
                .doOnCancel(() -> log.info("Anthropic call cancelled by downstream subscriber"))
                .onErrorResume(WebClientResponseException.class, e -> {
                    log.error("Anthropic API error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
                    return Mono.error(new AiException("AI provider error: " + e.getStatusCode()));
                })
                .onErrorResume(t -> !(t instanceof AiException), t -> {
                    log.error("Anthropic call failed: {}", t.getMessage(), t);
                    return Mono.error(new AiException("AI provider unavailable"));
                });
    }

    /**
     * Custom retry policy.
     *
     * Anthropic returns {@code 429 Too Many Requests} when the workspace's
     * rate-limit bucket is empty. Retrying immediately just makes things worse on
     * lower tiers (the bucket needs real time to refill), so we surface 429 to the
     * caller as soon as we see it — let the user retry when their UI is ready.
     *
     * For the failures we DO retry (5xx, IO errors), we honour the upstream's
     * {@code Retry-After} header when present; otherwise we fall back to the
     * configured exponential backoff. That keeps us aligned with Anthropic's own
     * recommendation when the upstream knows how long it will take to recover.
     */
    private Retry retryPolicy() {
        return Retry.from(signals -> signals.flatMap(rs -> {
            Throwable failure = rs.failure();
            if (!isRetriable(failure)) {
                return Mono.error(failure);
            }
            if (rs.totalRetries() >= properties.maxRetries()) {
                return Mono.error(failure);
            }
            Duration delay = retryDelay(failure, rs.totalRetries());
            log.warn(
                    "Retrying Anthropic call (attempt {} of {}, delay {}): {}",
                    rs.totalRetries() + 1,
                    properties.maxRetries(),
                    delay,
                    failure.getMessage());
            return Mono.delay(delay);
        }));
    }

    /**
     * Computes the delay before the next retry. If the failure carries an upstream
     * {@code Retry-After} hint, use it (capped to a sane upper bound); otherwise
     * compute exponential backoff from the configured base.
     */
    private Duration retryDelay(Throwable failure, long retryIndex) {
        Duration upstream = retryAfter(failure);
        if (upstream != null) {
            // Cap so a misconfigured upstream can't pin our request thread for hours.
            return upstream.compareTo(Duration.ofMinutes(2)) > 0 ? Duration.ofMinutes(2) : upstream;
        }
        long base = properties.retryBackoff().toMillis();
        long backoffMs = base << Math.min(retryIndex, 4);
        return Duration.ofMillis(backoffMs);
    }

    /**
     * Reads the {@code Retry-After} header (seconds) from a {@link WebClientResponseException}
     * if present. Returns {@code null} when the header is missing or malformed.
     */
    private static Duration retryAfter(Throwable t) {
        if (!(t instanceof WebClientResponseException wcre)) {
            return null;
        }
        String header = wcre.getHeaders().getFirst("Retry-After");
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            long seconds = Long.parseLong(header.trim());
            return seconds > 0 ? Duration.ofSeconds(seconds) : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    /**
     * Decides whether a failure is worth retrying.
     *
     * <p>Retriable:
     * <ul>
     *   <li>IO errors (connection reset, timeout, DNS hiccup…)</li>
     *   <li>HTTP 5xx (upstream blip)</li>
     * </ul>
     *
     * <p>NOT retriable:
     * <ul>
     *   <li>HTTP 429 — surfaced as-is. On low Anthropic tiers, retrying immediately just
     *       walks deeper into the same rate-limit pit; the caller (frontend) is in a better
     *       position to decide when to ask the user to try again.</li>
     *   <li>Other 4xx — caller bug, won't fix itself.</li>
     * </ul>
     */
    private static boolean isRetriable(Throwable t) {
        if (t instanceof IOException) {
            return true;
        }
        if (t instanceof WebClientResponseException wcre) {
            return wcre.getStatusCode().value() >= 500;
        }
        return false;
    }
}
