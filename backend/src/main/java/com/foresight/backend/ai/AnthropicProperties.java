package com.foresight.backend.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe binding for the {@code foresight.ai.anthropic.*} configuration namespace.
 *
 * @param apiKey  Anthropic API key — loaded from {@code ANTHROPIC_API_KEY} env var
 * @param baseUrl API base URL (e.g. {@code https://api.anthropic.com})
 * @param model   model identifier to use (e.g. {@code claude-sonnet-4-5})
 * @param version Anthropic API version header value (e.g. {@code 2023-06-01})
 */
@ConfigurationProperties(prefix = "foresight.ai.anthropic")
public record AnthropicProperties(String apiKey, String baseUrl, String model, String version) {}
