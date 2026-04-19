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
 * @param authDisabled              when {@code true}, every endpoint becomes public and a
 *                                  synthetic dev user is injected as the principal. NEVER enable
 *                                  this in production — only activated via the {@code local}
 *                                  profile.
 * @param jwt                       JWT-related settings (secret, TTL)
 * @param cors                      CORS-related settings (allowed origins)
 * @param passwordResetTokenTtl     lifetime of a password-reset token (e.g. {@code PT30M})
 * @param emailVerificationTokenTtl lifetime of an email-verification token (e.g. {@code PT24H})
 * @param rateLimit                 rate-limit settings keyed by endpoint family
 */
@ConfigurationProperties(prefix = "foresight.security")
public record SecurityProperties(
        boolean authDisabled,
        Jwt jwt,
        Cors cors,
        Duration passwordResetTokenTtl,
        Duration emailVerificationTokenTtl,
        RateLimit rateLimit) {

    /**
     * @param secret         HMAC secret used to sign/verify JWTs. Must be at least 32 bytes.
     * @param accessTokenTtl Lifetime of issued access tokens (e.g. {@code PT24H}).
     */
    public record Jwt(String secret, Duration accessTokenTtl) {}

    /**
     * @param allowedOrigins Comma-separated list of origins allowed by CORS (e.g. the frontend URL).
     */
    public record Cors(List<String> allowedOrigins) {}

    /**
     * @param auth bucket sizing for authentication endpoints (login/register/forgot-password)
     */
    public record RateLimit(Bucket auth) {

        /**
         * @param capacity      maximum tokens the bucket holds; determines burst tolerance
         * @param refillTokens  tokens added on each refill interval
         * @param refillPeriod  refill interval (e.g. {@code PT1M} for per-minute refill)
         */
        public record Bucket(long capacity, long refillTokens, Duration refillPeriod) {}
    }
}
