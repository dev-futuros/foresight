package com.foresight.backend.common.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.foresight.backend.common.config.SecurityProperties;

import lombok.extern.slf4j.Slf4j;

/**
 * Thin client over Kinde's Management API (<a href="https://docs.kinde.com/kinde-apis/management/">
 * {@code <tenant>.kinde.com/api/v1}</a>), used to fetch a user's profile when we need fields the
 * session JWT does not carry (first/last name, primary email, …).
 *
 * <p>Replaces the Clerk-era {@code ClerkBackendClient} once Phase 2 of the migration lands. Same
 * semantics — best-effort lookup that never propagates failures into the auth path — but uses the
 * OAuth2 {@code client_credentials} grant instead of a static bearer secret. The access token is
 * cached in memory and refreshed transparently before expiry.
 *
 * <p>Disabled when either {@code m2m-client-id} or {@code m2m-client-secret} is blank — every
 * method becomes a silent no-op returning {@link Optional#empty()}. That way the app boots and
 * authenticates fine in environments where the M2M app hasn't been wired yet (the user is still
 * created on the lazy-create path, just without a name until the webhook fires or the user edits
 * their profile).
 *
 * <p>Thread-safety: the access token cache is read on the hot path (every JWT-authenticated
 * request that triggers a lazy-create). Reads use a {@code volatile} reference; refresh uses a
 * dedicated lock with double-checked locking so concurrent first-fetches don't hit the token
 * endpoint multiple times.
 */
@Slf4j
@Component
public class KindeBackendClient {

    /** Refresh the cached token this far before its declared expiry, to avoid an in-flight expiry. */
    private static final Duration EXPIRY_SAFETY_MARGIN = Duration.ofSeconds(60);

    private final SecurityProperties.Kinde kinde;
    private final boolean enabled;
    private final RestClient restClient;

    /** Cached access token. {@code volatile} for visibility; refresh path is guarded by {@link #tokenLock}. */
    private volatile CachedToken cachedToken;

    private final Object tokenLock = new Object();

    public KindeBackendClient(SecurityProperties securityProperties) {
        this.kinde = securityProperties.kinde();
        this.enabled = kinde != null
                && kinde.m2mClientId() != null
                && !kinde.m2mClientId().isBlank()
                && kinde.m2mClientSecret() != null
                && !kinde.m2mClientSecret().isBlank();
        // We don't set a base URL because we hit two different endpoints (token + management API)
        // that don't share a common prefix beyond the tenant domain.
        this.restClient = enabled ? RestClient.builder().build() : null;
        if (!enabled) {
            log.info(
                    "Kinde Backend API disabled — M2M client id/secret not set. Lazy-created users "
                            + "will have a null name until the webhook fires or the user edits "
                            + "their profile.");
        }
    }

    /**
     * Fetches a single user from Kinde by id. Returns {@link Optional#empty()} if the client is
     * disabled, the user does not exist, or any error happens — callers must treat the result as
     * best-effort and never propagate failures from here, since the auth flow has to keep working
     * even when the Management API is briefly unreachable.
     */
    public Optional<KindeUser> fetchUser(String externalUserId) {
        if (!enabled || externalUserId == null || externalUserId.isBlank()) {
            return Optional.empty();
        }
        try {
            String token = ensureAccessToken();
            KindeUser user = restClient
                    .get()
                    .uri(kinde.managementApiBaseUrl() + "/user?id={id}", externalUserId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(KindeUser.class);
            // Diagnostic — Kinde's docs are inconsistent about whether the response uses
            // `first_name`/`last_name` or `given_name`/`family_name`, so we log what was
            // actually populated. Drop this when name backfill is reliably working in prod.
            if (user != null) {
                log.debug(
                        "Kinde fetchUser id={} firstName={} lastName={} composed={}",
                        user.id(),
                        user.firstName(),
                        user.lastName(),
                        user.composedName());
            }
            return Optional.ofNullable(user);
        } catch (Exception e) {
            log.warn("Could not fetch Kinde user {}: {}", externalUserId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Updates the user's display name in Kinde via the Management API. Our local model stores
     * {@code name} as a single string while Kinde stores first/last separately, so we split on
     * the first whitespace boundary ("Roger Henares" → first="Roger", last="Henares";
     * "Roger" → first="Roger", last="").
     *
     * <p>Kinde's docs / SDKs are inconsistent about which field names are accepted on PATCH
     * (some say {@code given_name}/{@code family_name}, others {@code first_name}/{@code
     * last_name}). We send all four keys with the same values — Kinde ignores unknown fields,
     * so this is harmless and forward-compatible.
     *
     * <p>Disabled-mode behaviour matches {@link #fetchUser}: a silent no-op when M2M credentials
     * aren't configured. Unlike {@code fetchUser}, failures here are propagated as runtime
     * exceptions so the caller can surface them to the user — swallowing a name change would let
     * the next {@code user.updated} webhook from Kinde overwrite the local edit with the old
     * value, which the user would experience as silent data loss.
     *
     * <p>Requires the M2M app to have the {@code update:users} scope granted on the Kinde
     * Management API. Without it the call returns 403 and the exception propagates.
     */
    public void updateUser(String externalUserId, String fullName) {
        if (!enabled || externalUserId == null || externalUserId.isBlank()) {
            return;
        }
        String[] parts = (fullName == null ? "" : fullName).trim().split("\\s+", 2);
        String first = parts.length > 0 ? parts[0] : "";
        String last = parts.length > 1 ? parts[1] : "";
        String token = ensureAccessToken();
        // Send both naming conventions to cover whichever variant Kinde's PATCH endpoint
        // currently honours. Unknown keys are ignored, so this is forward-safe.
        java.util.Map<String, String> body = new java.util.LinkedHashMap<>();
        body.put("given_name", first);
        body.put("family_name", last);
        body.put("first_name", first);
        body.put("last_name", last);
        restClient
                .patch()
                .uri(kinde.managementApiBaseUrl() + "/user?id={id}", externalUserId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();
    }

    /**
     * Returns a valid Management API access token, fetching a new one if the cache is missing
     * or close to expiry. Double-checked locking ensures only one thread hits the token endpoint
     * during concurrent first-fetches.
     */
    private String ensureAccessToken() {
        CachedToken current = cachedToken;
        if (current != null && current.isStillValid()) {
            return current.accessToken();
        }
        synchronized (tokenLock) {
            CachedToken afterLock = cachedToken;
            if (afterLock != null && afterLock.isStillValid()) {
                return afterLock.accessToken();
            }
            cachedToken = fetchNewAccessToken();
            return cachedToken.accessToken();
        }
    }

    /**
     * Performs an OAuth2 {@code client_credentials} request against Kinde's token endpoint to
     * obtain a fresh Management API access token. The {@code audience} parameter pins the token
     * to the Management API (Kinde routes tokens by audience). For stock Kinde tenants the
     * audience is always {@code <domain>/api}.
     */
    private CachedToken fetchNewAccessToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", kinde.m2mClientId());
        form.add("client_secret", kinde.m2mClientSecret());
        form.add("audience", kinde.domain() + "/api");

        TokenResponse response = restClient
                .post()
                .uri(kinde.tokenEndpoint())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(TokenResponse.class);

        if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
            throw new IllegalStateException("Kinde token endpoint returned an empty access token");
        }
        Instant expiresAt = Instant.now()
                .plusSeconds(response.expiresIn())
                .minus(EXPIRY_SAFETY_MARGIN);
        log.debug("Fetched new Kinde M2M access token, expires_in={}s", response.expiresIn());
        return new CachedToken(response.accessToken(), expiresAt);
    }

    /** Token-endpoint response envelope. Permissive deserialization so future Kinde fields don't break us. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_in") long expiresIn,
            @JsonProperty("token_type") String tokenType,
            @JsonProperty("scope") String scope) {}

    /** Wraps a Management API access token with the instant it stops being considered valid. */
    record CachedToken(String accessToken, Instant expiresAt) {
        boolean isStillValid() {
            return Instant.now().isBefore(expiresAt);
        }
    }

    /**
     * Subset of Kinde's user response — only the fields we currently mirror locally.
     *
     * <p>Kinde's documentation is inconsistent about which naming convention the Management API
     * GET response uses: some sources say snake_case OIDC ({@code given_name}/{@code family_name}),
     * others say snake_case Kinde-native ({@code first_name}/{@code last_name}). Rather than guess
     * and break on the next Kinde change, we map both via {@link JsonAlias} — whichever the
     * response carries, Jackson picks it up.
     *
     * <p>{@code @JsonIgnoreProperties(ignoreUnknown = true)} keeps the deserializer permissive
     * so Kinde can keep adding fields without breaking us.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KindeUser(
            String id,
            @JsonProperty("first_name") @JsonAlias("given_name") String firstName,
            @JsonProperty("last_name") @JsonAlias("family_name") String lastName) {

        /**
         * Composes a display name from the first/last fields, returning {@code null} if both
         * are missing so callers can chain {@code Optional} fallbacks.
         */
        public String composedName() {
            boolean hasFirst = firstName != null && !firstName.isBlank();
            boolean hasLast = lastName != null && !lastName.isBlank();
            if (!hasFirst && !hasLast) return null;
            if (!hasFirst) return lastName;
            if (!hasLast) return firstName;
            return firstName + " " + lastName;
        }
    }
}
