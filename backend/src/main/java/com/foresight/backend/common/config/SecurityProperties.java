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
 * @param kinde Kinde-related settings (auth + Management API M2M credentials)
 * @param cors CORS-related settings (allowed origins)
 * @param rateLimit rate-limit settings keyed by endpoint family
 */
@ConfigurationProperties(prefix = "foresight.security")
public record SecurityProperties(boolean authDisabled, Kinde kinde, Cors cors, RateLimit rateLimit) {

    /**
     * Kinde-related settings: the values needed to (a) validate session JWTs against Kinde's
     * JWKS endpoint, and (b) fetch user profile fields from Kinde's Management API on
     * lazy-create using the M2M client_credentials OAuth2 flow.
     *
     * <p>Kinde signs webhook deliveries with a JWT verified against the same JWKS endpoint as
     * the auth JWTs — there is intentionally no separate webhook signing secret to configure.
     *
     * @param domain                 Kinde tenant URL with scheme, no trailing slash
     *                               (e.g. {@code https://futuros.kinde.com}, or a custom domain
     *                               like {@code https://auth.futuros.io}). Used as the canonical
     *                               tenant root for any URL derivations that aren't overridden
     *                               by the more specific fields below.
     * @param issuer                 the {@code iss} claim value Kinde puts in every session JWT
     *                               (same value as {@code domain} for stock Kinde tenants).
     *                               Used by the strict issuer validator on incoming tokens.
     * @param jwksUri                public URI exposing Kinde's signing keys; the
     *                               {@code JwtDecoder} fetches and caches keys from here to
     *                               verify token signatures AND webhook JWT signatures.
     * @param tokenEndpoint          OAuth2 token endpoint used by {@code KindeBackendClient}
     *                               for the client_credentials grant
     *                               (e.g. {@code <domain>/oauth2/token}).
     * @param managementApiBaseUrl   base URL of the Management API
     *                               (e.g. {@code <domain>/api/v1}) — appended to per-call paths.
     * @param managementApiAudience  audience identifier of the Management API as registered
     *                               against the M2M app in Kinde. For stock tenants equal to
     *                               {@code <domain>/api}. For tenants with a custom domain,
     *                               Kinde keeps the audience as the original canonical
     *                               {@code <workspace>.kinde.com/api} even when all the URLs
     *                               above can be served via the custom domain. Mismatches yield
     *                               {@code "audience not whitelisted"} from the token endpoint.
     * @param accountApiBaseUrl      base URL of the user-token-scoped Account API used for
     *                               billing entitlements + per-user profile reads (e.g.
     *                               {@code <domain>/account_api/v1}). Distinct from the
     *                               Management API: scoped to "the user the token is for",
     *                               called with the caller's own access token (no M2M creds).
     * @param m2mClientId            Client ID of the Machine-to-Machine app created in the Kinde
     *                               Dashboard. Granted the {@code read:users} scope on the
     *                               Management API. Blank disables the backend client (lazy-
     *                               create will fall back to JWT claims for {@code name}).
     * @param m2mClientSecret        Secret of the M2M app. Sensitive — never log.
     */
    public record Kinde(
            String domain,
            String issuer,
            String jwksUri,
            String tokenEndpoint,
            String managementApiBaseUrl,
            String managementApiAudience,
            String accountApiBaseUrl,
            String m2mClientId,
            String m2mClientSecret) {}

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
