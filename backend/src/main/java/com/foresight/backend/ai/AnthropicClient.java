package com.foresight.backend.ai;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 *   <li>Retries on IO errors and HTTP 5xx / 429.</li>
 *   <li>Does NOT retry 4xx (except 429): those are caller bugs or quota issues that a retry
 *       won't fix.</li>
 *   <li>Exponential backoff starting from {@code retry-backoff}, up to {@code max-retries}
 *       extra attempts.</li>
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
     */
    private static final List<Map<String, Object>> WEB_SEARCH_TOOLS = List.of(
            Map.of("type", "web_search_20250305", "name", "web_search", "max_uses", 5));

    /**
     * Sends a single-turn request to Anthropic's {@code /v1/messages} endpoint.
     *
     * @param systemPrompt the system instruction (sets the model's role/format constraints)
     * @param userPrompt   the user's turn content
     * @param maxTokens    upper bound on response length; pick generously for long outputs
     * @return a Mono that emits the raw JSON response from Anthropic
     */
    public Mono<JsonNode> sendMessage(String systemPrompt, String userPrompt, int maxTokens) {
        return doSend(systemPrompt, userPrompt, maxTokens, null);
    }

    /**
     * Same as {@link #sendMessage} but enables Anthropic's server-side {@code web_search} tool
     * so the model can ground its answer on live data. The response may contain interleaved
     * {@code tool_use}/{@code tool_result} blocks — callers should filter content by
     * {@code type == "text"} before parsing.
     */
    public Mono<JsonNode> sendMessageWithWebSearch(String systemPrompt, String userPrompt, int maxTokens) {
        return doSend(systemPrompt, userPrompt, maxTokens, WEB_SEARCH_TOOLS);
    }

    private Mono<JsonNode> doSend(
            String systemPrompt, String userPrompt, int maxTokens, List<Map<String, Object>> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", properties.model());
        body.put("max_tokens", maxTokens);
        body.put("system", systemPrompt);
        body.put("messages", List.of(Map.of("role", "user", "content", userPrompt)));
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }

        return anthropicWebClient
                .post()
                .uri("/v1/messages")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .retryWhen(Retry.backoff(properties.maxRetries(), properties.retryBackoff())
                        .filter(AnthropicClient::isRetriable)
                        .doBeforeRetry(rs -> log.warn(
                                "Retrying Anthropic call (attempt {} of {}): {}",
                                rs.totalRetries() + 1,
                                properties.maxRetries(),
                                rs.failure().getMessage()))
                        .onRetryExhaustedThrow((spec, rs) -> rs.failure()))
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
     * Decides whether a failure is worth retrying.
     *
     * <p>Retriable:
     * <ul>
     *   <li>IO errors (connection reset, timeout, DNS hiccup…)</li>
     *   <li>HTTP 5xx (upstream blip)</li>
     *   <li>HTTP 429 (rate limited — backoff gives the bucket time to refill)</li>
     * </ul>
     * Everything else (4xx, auth errors) is a deterministic failure a retry can't fix.
     */
    private static boolean isRetriable(Throwable t) {
        if (t instanceof IOException) {
            return true;
        }
        if (t instanceof WebClientResponseException wcre) {
            int status = wcre.getStatusCode().value();
            return status == 429 || status >= 500;
        }
        return false;
    }
}
