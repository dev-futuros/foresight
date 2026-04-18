package com.foresight.backend.ai;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Thin transport wrapper around the Anthropic Messages API.
 *
 * <p>Keeps HTTP concerns (headers, timeouts, error translation) out of {@link AiService}. Uses
 * {@link WebClient#block(Duration)} — we intentionally call it synchronously because the
 * controller contract is synchronous and the upstream request dominates latency anyway.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnthropicClient {

    /** Hard ceiling on how long we wait for Anthropic to respond before giving up. */
    private static final Duration TIMEOUT = Duration.ofSeconds(120);

    private final WebClient anthropicWebClient;
    private final AnthropicProperties properties;

    /**
     * Sends a single-turn request to Anthropic's {@code /v1/messages} endpoint.
     *
     * @param systemPrompt the system instruction (sets the model's role/format constraints)
     * @param userPrompt   the user's turn content
     * @param maxTokens    upper bound on response length; pick generously for long outputs
     * @return the raw JSON response from Anthropic
     * @throws AiException if Anthropic returns a non-2xx status or any network error occurs
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
                    .block(TIMEOUT);
        } catch (WebClientResponseException e) {
            log.error("Anthropic API error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new AiException("AI provider error: " + e.getStatusCode());
        }
    }
}
