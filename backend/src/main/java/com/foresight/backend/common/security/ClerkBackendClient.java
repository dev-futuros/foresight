package com.foresight.backend.common.security;

import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.foresight.backend.common.config.SecurityProperties;

import lombok.extern.slf4j.Slf4j;

/**
 * Thin client over Clerk's Backend API (<a href="https://clerk.com/docs/reference/backend-api">
 * api.clerk.com/v1</a>), used to fetch a user's profile when we need fields the session JWT
 * doesn't carry (first/last name, primary email, …).
 *
 * <p>Why we need it — Clerk's default session JWT only contains identity claims ({@code sub},
 * {@code iss}, {@code exp}, …); it does NOT include name or email. Two ways to surface those
 * fields server-side:
 *
 * <ol>
 *   <li>Configure a Clerk JWT template that adds the claims, and use it from the frontend.
 *   <li>Have the backend call Clerk's Backend API with the secret key on lazy-create.
 * </ol>
 *
 * <p>We pick (2) so the integration works out of the box without depending on a manual Dashboard
 * step. The webhook will keep the row in sync after subsequent profile edits.
 *
 * <p>Disabled when {@code foresight.security.clerk.secret-key} is blank — every method becomes a
 * silent no-op returning {@link Optional#empty()}. That way the app boots and authenticates fine
 * in environments where the secret hasn't been wired yet (the user is still created, just
 * without a name).
 */
@Slf4j
@Component
public class ClerkBackendClient {

    private final RestClient restClient;
    private final boolean enabled;

    public ClerkBackendClient(SecurityProperties securityProperties) {
        SecurityProperties.Clerk clerk = securityProperties.clerk();
        String secretKey = clerk.secretKey();
        this.enabled = secretKey != null && !secretKey.isBlank();
        if (enabled) {
            this.restClient = RestClient.builder()
                    .baseUrl(clerk.apiBaseUrl())
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + secretKey)
                    .build();
        } else {
            this.restClient = null;
            log.info(
                    "Clerk Backend API disabled — CLERK_SECRET_KEY is not set. Lazy-created users "
                            + "will have a null name until the webhook fires or the user edits "
                            + "their profile.");
        }
    }

    /**
     * Fetches a single user from Clerk by id. Returns {@link Optional#empty()} if the client is
     * disabled, the user doesn't exist, or any error happens — callers must treat the result as
     * best-effort and never propagate failures from here, since the auth flow has to keep working
     * even when Clerk's API is briefly unreachable.
     */
    public Optional<ClerkUser> fetchUser(String clerkUserId) {
        if (!enabled || clerkUserId == null || clerkUserId.isBlank()) {
            return Optional.empty();
        }
        try {
            ClerkUser user = restClient
                    .get()
                    .uri("/users/{id}", clerkUserId)
                    .retrieve()
                    .body(ClerkUser.class);
            return Optional.ofNullable(user);
        } catch (Exception e) {
            log.warn("Could not fetch Clerk user {}: {}", clerkUserId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Subset of Clerk's user response — only the fields we currently mirror locally.
     * {@code @JsonIgnoreProperties(ignoreUnknown = true)} keeps the deserializer permissive so
     * Clerk can keep adding fields without breaking us.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ClerkUser(
            String id,
            @JsonProperty("first_name") String firstName,
            @JsonProperty("last_name") String lastName) {

        /**
         * Composes a display name from {@code first_name} / {@code last_name}, returning
         * {@code null} if both are missing so callers can chain {@code Optional} fallbacks.
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
