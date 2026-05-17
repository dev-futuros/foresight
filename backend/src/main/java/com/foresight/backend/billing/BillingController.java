package com.foresight.backend.billing;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.billing.dto.BillingProfileResponse;
import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;

/**
 * Billing surface for the authenticated user. Currently a single read endpoint that returns
 * the composed plan + per-period quota + usage snapshot the frontend renders the paywall
 * and quota chip from.
 *
 * <p>Checkout and customer-portal navigation happen client-side via the Kinde React SDK
 * (URL params for plan selection, {@code generatePortalUrl} for the billing portal), so
 * there's no checkout-session creation endpoint here — Kinde Billing handles that flow
 * end-to-end on its hosted pages.
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    /** Length of the {@code "Bearer "} prefix in the {@code Authorization} header. */
    private static final int BEARER_PREFIX_LENGTH = "Bearer ".length();

    private final BillingService billingService;

    /**
     * Returns the caller's billing profile (plan + per-period quota + usage). Used by the
     * frontend to render the paywall, the quota chip, and the "renews in X days" copy.
     *
     * <p>{@code authHeader} is forwarded to Kinde's Account API by {@link BillingService} —
     * the Account API is scoped to "the user the token is for", so we don't need any
     * elevated credentials.
     *
     * @param principal  authenticated caller
     * @param authHeader incoming {@code Authorization: Bearer …} header (forwarded as-is)
     * @return the billing snapshot
     */
    @Operation(summary = "Return the caller's billing profile (plan, limit, usage, period bounds).")
    @GetMapping("/entitlements")
    public BillingProfileResponse entitlements(
            @CurrentUser AuthenticatedUser principal, @RequestHeader("Authorization") String authHeader) {
        return billingService.getProfile(principal.id(), principal.externalUserId(), stripBearer(authHeader));
    }

    /**
     * <b>Debug endpoint</b> — fires {@link BillingService#recordGeneration} for the caller
     * (Property counter +1 + meter push +1), exactly like a real wizard "Generate" click
     * but without the actual AI batch. Returns the resulting {@link BillingProfileResponse}
     * so the test button can confirm the increment landed.
     *
     * <p>Errors from inside {@code recordGeneration} (no plan → 402, limit hit → 429,
     * Kinde unreachable → 5xx) bubble through {@code GlobalExceptionHandler} as usual,
     * so the frontend's catch block sees the same error shape it would on a real
     * generation.
     *
     * <p>Should be gated to DEV role before going to production, or just removed once
     * we're confident the flow is reliable.
     */
    @Operation(summary = "DEBUG — record a generation event for the caller (no AI run). Mirrors what the wizard Generate button triggers.")
    @PostMapping("/_debug/push-meter")
    public BillingProfileResponse debugPushMeter(
            @CurrentUser AuthenticatedUser principal, @RequestHeader("Authorization") String authHeader) {
        String token = stripBearer(authHeader);
        billingService.recordGeneration(principal.id(), principal.externalUserId(), token);
        return billingService.getProfile(principal.id(), principal.externalUserId(), token);
    }

    /**
     * Drops the {@code "Bearer "} prefix off a standard {@code Authorization} header so we can
     * forward just the raw JWT to downstream calls. Returns the string unchanged if the prefix
     * isn't present — the JwtAuthFilter has already validated the header by the time we get
     * here, so anomalies here are programmer errors rather than runtime input.
     */
    private static String stripBearer(String authHeader) {
        if (authHeader == null) return null;
        if (authHeader.regionMatches(true, 0, "Bearer ", 0, BEARER_PREFIX_LENGTH)) {
            return authHeader.substring(BEARER_PREFIX_LENGTH).trim();
        }
        return authHeader.trim();
    }
}
