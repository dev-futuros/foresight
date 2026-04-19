package com.foresight.backend.ai;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe binding for the {@code foresight.ai.anthropic.*} configuration namespace.
 *
 * @param apiKey         Anthropic API key — loaded from {@code ANTHROPIC_API_KEY} env var
 * @param baseUrl        API base URL (e.g. {@code https://api.anthropic.com})
 * @param model          model identifier to use (e.g. {@code claude-sonnet-4-5})
 * @param version        Anthropic API version header value (e.g. {@code 2023-06-01})
 * @param connectTimeout TCP connect timeout for outbound calls
 * @param readTimeout    per-request read timeout (hard ceiling before giving up)
 * @param maxRetries     number of attempts AFTER the first one on retriable failures
 *                       (5xx, 429, IO errors). Total calls = 1 + {@code maxRetries}.
 * @param retryBackoff   base delay between retries; doubled each attempt (exponential)
 */
@ConfigurationProperties(prefix = "foresight.ai.anthropic")
public record AnthropicProperties(
        String apiKey,
        String baseUrl,
        String model,
        String version,
        Duration connectTimeout,
        Duration readTimeout,
        int maxRetries,
        Duration retryBackoff) {}
