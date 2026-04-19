package com.foresight.backend.ai;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.util.retry.Retry;

/**
 * Thin transport wrapper around the Anthropic Messages API.
 *
 * <p>Keeps HTTP concerns (headers, timeouts, retries, error translation) out of
 * {@link AiService}. Uses {@link reactor.core.publisher.Mono#block(java.time.Duration)} — we
 * intentionally call it synchronously because the controller contract is synchronous and
 * the upstream request dominates latency anyway.
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
     * Sends a single-turn request to Anthropic's {@code /v1/messages} endpoint.
     *
     * @param systemPrompt the system instruction (sets the model's role/format constraints)
     * @param userPrompt   the user's turn content
     * @param maxTokens    upper bound on response length; pick generously for long outputs
     * @return the raw JSON response from Anthropic
     * @throws AiException if Anthropic returns a non-retriable error or retries are exhausted
     */
    public JsonNode sendMessage(String systemPrompt, String userPrompt, int maxTokens) {
        Map<String, Object> body = Map.of(
                "model",
                properties.model(),
                "max_tokens",
                maxTokens,
                "system",
                systemPrompt,
                "messages",
                List.of(Map.of("role", "user", "content", userPrompt)));

        try {
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
                    .block(properties.readTimeout().plusSeconds(5));
        } catch (WebClientResponseException e) {
            log.error("Anthropic API error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new AiException("AI provider error: " + e.getStatusCode());
        } catch (Exception e) {
            log.error("Anthropic call failed: {}", e.getMessage(), e);
            throw new AiException("AI provider unavailable");
        }
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
