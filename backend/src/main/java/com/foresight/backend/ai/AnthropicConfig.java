package com.foresight.backend.ai;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Spring configuration for the Anthropic integration.
 *
 * <p>Builds the pre-configured {@link WebClient} used by {@link AnthropicClient}, with the base
 * URL, API key, and API version headers already baked in so call sites don't repeat themselves.
 */
@Configuration
@EnableConfigurationProperties(AnthropicProperties.class)
public class AnthropicConfig {

    /**
     * Creates the {@link WebClient} bean used for all Anthropic calls.
     *
     * @param properties resolved {@code foresight.ai.anthropic.*} settings
     * @return a {@link WebClient} with base URL and auth/version headers configured
     */
    @Bean
    public WebClient anthropicWebClient(AnthropicProperties properties) {
        return WebClient.builder()
                .baseUrl(properties.baseUrl())
                .defaultHeader("x-api-key", properties.apiKey())
                .defaultHeader("anthropic-version", properties.version())
                .defaultHeader("content-type", "application/json")
                .build();
    }
}
