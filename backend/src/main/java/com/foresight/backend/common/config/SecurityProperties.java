package com.foresight.backend.common.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Typed configuration for all security-related properties.
 *
 * <p>Bound from {@code application.properties} entries prefixed with {@code foresight.security.*}.
 * Using {@code @ConfigurationProperties} instead of scattered {@code @Value} annotations gives us
 * compile-time safety and keeps security knobs in one place.
 *
 * @param authDisabled when {@code true}, every endpoint becomes public and a synthetic dev user is
 *     injected as the principal. NEVER enable this in production — only activated via the {@code
 *     local} profile.
 * @param clerk Clerk-related settings (issuer, JWKS, webhook signing secret)
 * @param cors CORS-related settings (allowed origins)
 * @param rateLimit rate-limit settings keyed by endpoint family
 */
@ConfigurationProperties(prefix = "foresight.security")
public record SecurityProperties(boolean authDisabled, Clerk clerk, Cors cors, RateLimit rateLimit) {

    /**
     * Settings required to validate session JWTs issued by Clerk, to verify webhook deliveries,
     * and to call Clerk's Backend API for profile lookups.
     *
     * @param issuer the {@code iss} claim value Clerk puts in every session JWT (e.g.
     *     {@code https://your-app.clerk.accounts.dev} for dev or {@code https://clerk.example.com}
     *     when using a custom domain in production). Used as a strict validator on incoming tokens.
     * @param jwksUri public URI exposing Clerk's signing keys; the {@code JwtDecoder} fetches and
     *     caches keys from here to verify token signatures.
     * @param webhookSigningSecret HMAC secret used to verify the Svix signature of incoming
     *     webhooks. Pulled from the Clerk Dashboard → Webhooks page after creating an endpoint.
     * @param secretKey Clerk Backend API secret key ({@code sk_test_...} / {@code sk_live_...}).
     *     Used server-side to fetch user profile fields when lazy-creating a local row. Blank if
     *     the feature is disabled.
     * @param apiBaseUrl base URL of the Clerk Backend API (defaults to {@code https://api.clerk.com/v1}).
     */
    public record Clerk(
            String issuer,
            String jwksUri,
            String webhookSigningSecret,
            String secretKey,
            String apiBaseUrl) {}

    /**
     * @param allowedOrigins Comma-separated list of origins allowed by CORS (e.g. the frontend
     *     URL).
     */
    public record Cors(List<String> allowedOrigins) {}

    /**
     * @param ai bucket sizing for AI endpoints (suggest-steep, suggest-horizon, global-steep,
     *     analyze) — keyed by authenticated user id, not IP, since the calls require auth
     */
    public record RateLimit(Bucket ai) {

        /**
         * @param capacity maximum tokens the bucket holds; determines burst tolerance
         * @param refillTokens tokens added on each refill interval
         * @param refillPeriod refill interval (e.g. {@code PT1M} for per-minute refill)
         */
        public record Bucket(long capacity, long refillTokens, Duration refillPeriod) {}
    }
}
