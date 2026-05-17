package com.foresight.backend.common.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
        // RestClient is created unconditionally — cheap to instantiate and avoids a nullable
        // field. No base URL because we hit two different endpoints (token + management API)
        // that don't share a common prefix beyond the tenant domain. When `enabled` is false,
        // the gated methods short-circuit before ever touching this field.
        this.restClient = RestClient.builder().build();
        if (!enabled) {
            log.info("Kinde Backend API disabled — M2M client id/secret not set. Lazy-created users "
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
        // currently honours. Unknown keys are ignored, so this is forward-safe. LinkedHashMap
        // keeps the order stable across runs — useful when eyeballing request logs.
        Map<String, String> body = new LinkedHashMap<>();
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
     * audience is {@code <domain>/api} (the default). For tenants with a custom domain the
     * audience stays as the canonical {@code <workspace>.kinde.com/api} — see
     * {@link SecurityProperties.Kinde#managementApiAudience()}.
     */
    private CachedToken fetchNewAccessToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", kinde.m2mClientId());
        form.add("client_secret", kinde.m2mClientSecret());
        form.add("audience", kinde.managementApiAudience());

        TokenResponse response = restClient
                .post()
                .uri(kinde.tokenEndpoint())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(TokenResponse.class);

        if (response == null
                || response.accessToken() == null
                || response.accessToken().isBlank()) {
            throw new IllegalStateException("Kinde token endpoint returned an empty access token");
        }
        Instant expiresAt = Instant.now().plusSeconds(response.expiresIn()).minus(EXPIRY_SAFETY_MARGIN);
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
     * Fetches the user's custom Properties from Kinde. Returns an empty map if the client is
     * disabled, the user doesn't exist, or any error happens — same best-effort semantics as
     * {@link #fetchUser}. The caller decides how to fall back when a key is missing (typically
     * by applying a service-side default like {@code "es"} for {@code language}).
     *
     * <p>Properties are defined per-tenant in Kinde Dashboard → Settings → Properties; reading a
     * key that hasn't been defined yields a missing entry (not an error). Values come back as
     * strings — Kinde's Property values are always stringly-typed even when the property is
     * declared as a boolean / integer in the dashboard.
     *
     * <p>Requires the M2M app to have {@code read:user_properties} granted.
     */
    public Map<String, String> fetchUserProperties(String externalUserId) {
        if (!enabled || externalUserId == null || externalUserId.isBlank()) {
            return Map.of();
        }
        try {
            String token = ensureAccessToken();
            KindePropertyValuesResponse response = restClient
                    .get()
                    .uri(kinde.managementApiBaseUrl() + "/users/{id}/properties", externalUserId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(KindePropertyValuesResponse.class);
            if (response == null || response.properties() == null) {
                return Map.of();
            }
            // Kinde returns an array of {key, value} pairs; flatten to a map so callers can do
            // O(1) lookups. Last-wins on key collisions, which shouldn't happen in practice
            // (Kinde's dashboard enforces unique keys).
            Map<String, String> out = new LinkedHashMap<>();
            for (KindeProperty p : response.properties()) {
                if (p.key() != null) out.put(p.key(), p.value());
            }
            return out;
        } catch (Exception e) {
            log.warn("Could not fetch Kinde properties for user {}: {}", externalUserId, e.getMessage());
            return Map.of();
        }
    }

    /**
     * Updates one or more Kinde Properties for the user in a single PATCH. The map's keys must
     * match Property keys defined in Kinde Dashboard → Settings → Properties; updating a key
     * that doesn't exist yields a 400 from Kinde. Values are coerced to strings on the wire
     * (Kinde stores Property values as strings regardless of declared type).
     *
     * <p>Unlike {@link #fetchUserProperties}, failures here are propagated as runtime exceptions
     * so the caller can surface them to the user (same reasoning as {@link #updateUser}: a
     * silent swallow would let the next webhook overwrite the intended change with the stale
     * value, which the user would experience as data loss).
     *
     * <p>No-op when the map is empty so callers can build it conditionally without guarding.
     * Disabled-mode is also a no-op, matching {@link #fetchUser}.
     *
     * <p>Requires the M2M app to have {@code update:user_properties} granted.
     */
    public void updateUserProperties(String externalUserId, Map<String, String> properties) {
        if (!enabled || externalUserId == null || externalUserId.isBlank() || properties == null || properties.isEmpty()) {
            return;
        }
        String token = ensureAccessToken();
        // Wrap the flat map in the {properties: {…}} envelope Kinde's PATCH expects — see
        // https://github.com/kinde-oss/management-api-js (lib/api/sdk.gen.ts, updateUserProperties).
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("properties", properties);
        restClient
                .patch()
                .uri(kinde.managementApiBaseUrl() + "/users/{id}/properties", externalUserId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();
    }

    /**
     * Subset of Kinde's user response — only the fields we read on our side.
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
            @JsonProperty("last_name") @JsonAlias("family_name") String lastName,
            @JsonProperty("preferred_email") @JsonAlias({"email"}) String preferredEmail,
            String picture) {

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

    /**
     * Envelope returned by {@code GET /api/v1/users/{user_id}/properties}. We only consume
     * {@code properties}; the {@code code} / {@code message} / {@code next_token} fields are
     * informational and dropped via {@code @JsonIgnoreProperties}. Pagination isn't relevant in
     * practice — even a heavy app would have a handful of Properties, well under Kinde's page
     * size — so we read the first page only.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record KindePropertyValuesResponse(List<KindeProperty> properties) {
        public List<KindeProperty> properties() {
            return properties == null ? Collections.emptyList() : properties;
        }
    }

    /**
     * Single Property entry inside the {@link KindePropertyValuesResponse} array. We only need
     * {@code key} and {@code value}; the {@code id} / {@code name} / {@code description}
     * descriptors are dashboard metadata, not data we'd surface to the user.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record KindeProperty(String key, String value) {}
}
