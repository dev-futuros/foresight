package com.foresight.backend.analytics;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe binding for the {@code foresight.analytics.posthog.*} configuration namespace.
 *
 * <p>PostHog server-side instrumentation is feature-flagged off by default so dev / CI
 * environments don't ship analytics to a real project. Set {@code POSTHOG_ENABLED=true}
 * and supply {@code POSTHOG_KEY} (and optionally {@code POSTHOG_HOST}) in the environment
 * to turn it on.
 *
 * @param enabled when {@code false} (the default), {@link LlmCapture} becomes a no-op and
 *                the {@code PostHog} bean is not created. Auto-disabled when {@link #apiKey}
 *                is blank even if {@code enabled} is true.
 * @param apiKey  PostHog project API key ({@code phc_*}). Same key the frontend posthog-js
 *                snippet uses — PostHog scopes events by project, not by SDK.
 * @param host    PostHog ingestion host. Defaults to the EU cloud
 *                ({@code https://eu.i.posthog.com}); set to {@code https://us.i.posthog.com}
 *                if the project lives on the US instance.
 */
@ConfigurationProperties(prefix = "foresight.analytics.posthog")
public record AnalyticsProperties(boolean enabled, String apiKey, String host) {

    public boolean isUsable() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }
}
