package com.foresight.backend.analytics;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.posthog.server.PostHog;
import com.posthog.server.PostHogInterface;

import lombok.extern.slf4j.Slf4j;

/**
 * Spring configuration for PostHog server-side analytics.
 *
 * <p>Produces a singleton {@link PostHogInterface} only when
 * {@code foresight.analytics.posthog.enabled=true}. Otherwise no bean is registered;
 * consumers (currently {@link LlmCapture}) inject {@code Optional<PostHogInterface>} and
 * treat absence as "analytics disabled" — no null checks, no try/catch around the SDK at
 * every call site.
 *
 * <p>An enabled-but-keyless misconfig is treated as a hard failure (rather than a silent
 * no-op) so deploys that mean to ship analytics but forgot the key surface immediately.
 *
 * <p>The SDK queues events in-process and flushes them periodically to the PostHog ingestion
 * host; {@code destroyMethod = "close"} ensures the queue is drained on JVM shutdown so we
 * don't lose the last few events when the container restarts.
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(AnalyticsProperties.class)
public class PostHogConfig {

    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(prefix = "foresight.analytics.posthog", name = "enabled", havingValue = "true")
    public PostHogInterface postHog(AnalyticsProperties properties) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            throw new IllegalStateException(
                    "foresight.analytics.posthog.enabled=true but apiKey is blank — set POSTHOG_KEY or"
                            + " disable analytics via foresight.analytics.posthog.enabled=false.");
        }
        String host = (properties.host() == null || properties.host().isBlank())
                ? "https://eu.i.posthog.com"
                : properties.host();
        log.info("Initialising PostHog analytics: host={}", host);
        com.posthog.server.PostHogConfig config = com.posthog.server.PostHogConfig.builder(properties.apiKey())
                .host(host)
                .build();
        return PostHog.with(config);
    }
}
