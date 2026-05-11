package com.foresight.backend.ai;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe binding for the {@code foresight.ai.anthropic.*} configuration namespace.
 *
 * @param apiKey         Anthropic API key — loaded from {@code ANTHROPIC_API_KEY} env var
 * @param baseUrl        API base URL (e.g. {@code https://api.anthropic.com})
 * @param model          fallback model identifier (used when no specific tier is requested)
 * @param models         per-tier model identifiers (haiku/sonnet/opus). Each operation in
 *                       {@link AiService} picks the tier that matches its cost/quality
 *                       profile — see that class for the mapping. Falls back to
 *                       {@link #model} when a tier isn't configured.
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
        Models models,
        String version,
        Duration connectTimeout,
        Duration readTimeout,
        int maxRetries,
        Duration retryBackoff) {

    /**
     * Per-tier model identifiers. Bound from
     * {@code foresight.ai.anthropic.models.{haiku|sonnet|opus}}. Any field
     * left blank falls back to the top-level {@link #model} default.
     */
    public record Models(String haiku, String sonnet, String opus) {}

    /** Convenience accessor — returns the configured Haiku model id, or the default if blank. */
    public String haiku() {
        return resolve(models == null ? null : models.haiku());
    }

    /** Convenience accessor — returns the configured Sonnet model id, or the default if blank. */
    public String sonnet() {
        return resolve(models == null ? null : models.sonnet());
    }

    /** Convenience accessor — returns the configured Opus model id, or the default if blank. */
    public String opus() {
        return resolve(models == null ? null : models.opus());
    }

    private String resolve(String tier) {
        return (tier == null || tier.isBlank()) ? model : tier;
    }
}
