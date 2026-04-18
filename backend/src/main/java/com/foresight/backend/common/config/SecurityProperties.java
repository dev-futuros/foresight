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
 * @param jwt  JWT-related settings (secret, TTL)
 * @param cors CORS-related settings (allowed origins)
 */
@ConfigurationProperties(prefix = "foresight.security")
public record SecurityProperties(Jwt jwt, Cors cors) {

    /**
     * @param secret         HMAC secret used to sign/verify JWTs. Must be at least 32 bytes.
     * @param accessTokenTtl Lifetime of issued access tokens (e.g. {@code PT24H}).
     */
    public record Jwt(String secret, Duration accessTokenTtl) {}

    /**
     * @param allowedOrigins Comma-separated list of origins allowed by CORS (e.g. the frontend URL).
     */
    public record Cors(List<String> allowedOrigins) {}
}
