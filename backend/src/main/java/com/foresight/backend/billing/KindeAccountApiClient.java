package com.foresight.backend.billing;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.foresight.backend.common.config.SecurityProperties;

import lombok.extern.slf4j.Slf4j;

/**
 * Thin client over Kinde's Account API — the user-token-scoped surface (different from the
 * Management API which uses M2M credentials). Used to fetch the authenticated user's billing
 * entitlements (which plan they're on, what their per-feature limits are).
 *
 * <p>Authentication: forwards the caller's own access token in the {@code Authorization}
 * header. Account API responses are scoped to "the user the token is for", which is exactly
 * what we want for {@code GET /api/billing/entitlements} — we don't need elevated privileges.
 *
 * <p>The Account API does NOT expose current usage / consumed units (only the limits). Usage
 * tracking lives in our local DB (count of {@code reports} rows per user per billing period)
 * — see {@link BillingService}. Kinde tracks usage too, but only internally for its dashboard
 * and end-of-period billing. We don't need to push usage back to Kinde while our plan is
 * flat-rate (no overage); when overage lands, we'll wire usage reporting via the Management
 * API at that point.
 *
 * <p>Best-effort semantics: any exception yields {@link Optional#empty()} and a WARN log —
 * never propagates into the calling controller. The {@link BillingService} treats an empty
 * Optional as "no active subscription" and gates accordingly.
 */
@Slf4j
@Component
public class KindeAccountApiClient {

    private final SecurityProperties.Kinde kinde;
    private final RestClient restClient;

    public KindeAccountApiClient(SecurityProperties securityProperties) {
        this.kinde = securityProperties.kinde();
        this.restClient = RestClient.builder().build();
    }

    /**
     * Fetches the entitlements payload for the user identified by {@code userAccessToken}.
     * Returns empty if the token is missing/blank or if the call fails for any reason
     * (Kinde down, token rejected, network blip).
     */
    public Optional<KindeEntitlements> fetchEntitlements(String userAccessToken) {
        if (userAccessToken == null || userAccessToken.isBlank()) {
            return Optional.empty();
        }
        try {
            KindeEntitlementsResponse response = restClient
                    .get()
                    .uri(kinde.accountApiBaseUrl() + "/entitlements")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userAccessToken)
                    .retrieve()
                    .body(KindeEntitlementsResponse.class);
            return response == null ? Optional.empty() : Optional.ofNullable(response.data());
        } catch (Exception e) {
            log.warn("Could not fetch Kinde entitlements: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /** Envelope returned by {@code GET /account_api/v1/entitlements}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KindeEntitlementsResponse(KindeEntitlements data, boolean success) {}

    /**
     * Subset of the {@code data} block we care about: which plans the user is on, the org
     * grouping, and the per-feature entitlements (with limits). Pagination fields
     * ({@code has_more}, {@code next_page_starting_after}) are dropped — Kinde won't paginate
     * a handful of entitlements per user.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KindeEntitlements(
            List<KindePlan> plans, @JsonProperty("org_code") String orgCode, List<KindeEntitlement> entitlements) {

        public List<KindePlan> plans() {
            return plans == null ? Collections.emptyList() : plans;
        }

        public List<KindeEntitlement> entitlements() {
            return entitlements == null ? Collections.emptyList() : entitlements;
        }
    }

    /**
     * One of the plans the user is subscribed to. {@code subscribedOn} is the timestamp the
     * subscription was activated — we anchor our monthly billing-period computations off it.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KindePlan(String key, String name, @JsonProperty("subscribed_on") Instant subscribedOn) {}

    /**
     * One feature entitlement attached to one of the user's plans. Two relevant shapes:
     *
     * <ul>
     *   <li><b>The plan itself</b> shows up as an entitlement with {@code fixed_charge} set
     *       (e.g. €99 for {@code "pro"}). We filter these out in {@link BillingService} by
     *       matching against the configured per-feature keys we actually care about.</li>
     *   <li><b>Metered features</b> like {@code reports_per_periodo} have
     *       {@code entitlement_limit_max} set to the per-period cap.</li>
     * </ul>
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KindeEntitlement(
            @JsonProperty("feature_key") String featureKey,
            @JsonProperty("feature_name") String featureName,
            @JsonProperty("entitlement_limit_max") Integer maxUnits,
            @JsonProperty("entitlement_limit_min") Integer minUnits) {}
}
