package com.foresight.backend.billing;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.foresight.backend.billing.dto.BillingProfileResponse;
import com.foresight.backend.common.security.DevPrincipal;
import com.foresight.backend.common.security.KindeBackendClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Composes the user's billing snapshot and gates report generations against the per-period
 * quota. Kinde is the source of truth for both the limit AND the current usage — there is
 * no local database column tracking it. The usage counter lives as two Kinde User Properties
 * (read/written via Management API) and gets reset lazily when the billing period rolls over.
 *
 * <p>What counts as "1 usage" — every successful POST to {@code /api/reports/{id}/generate},
 * which is what the frontend calls when the user clicks the "Generate" button at the end of
 * the wizard (regardless of whether it's a fresh draft or a regeneration of an existing
 * completed report). Drafts themselves are FREE: creating, editing, autosaving a draft does
 * not consume a slot. The expensive thing is the 5 parallel Anthropic calls that fire after
 * "Generate", so that's where billing kicks in.
 *
 * <p>Kinde does NOT expose a "current usage" read endpoint of its own (Account API only
 * surfaces the limit, Management API's billing endpoints likewise). Hence the Properties
 * approach: we store the count + the anchor of the current period, read both back when we
 * need them, and reset to zero whenever the anchor we see has shifted forward by one or
 * more months relative to {@code subscribed_on} from the entitlement.
 *
 * <p>Dev-mode short-circuit: the synthetic {@code user_local_dev} principal has no Kinde
 * counterpart, so we return a "subscribed, effectively unlimited" profile and skip the gate
 * entirely. Real billing test flows need a Kinde-authenticated user.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BillingService {

    /**
     * Kinde entitlement key for the per-period report quota. MUST match the key configured
     * in Kinde Dashboard → Billing → Plan → Features. Currently {@code reports_per_periodo}
     * (Spanish spelling preserved on purpose — that's what Roger set in the dashboard, and
     * Kinde keys are immutable once published).
     */
    static final String REPORTS_FEATURE_KEY = "reports_per_periodo";

    /**
     * Kinde User Property keys for the local counter. Must be created in
     * Kinde Dashboard → Settings → Properties before this service can write to them
     * (Kinde rejects PATCH for undefined Property keys). Both are Single line text.
     */
    static final String USED_PROPERTY_KEY = "reports_used_this_period";

    static final String PERIOD_START_PROPERTY_KEY = "reports_period_start";

    /** Synthetic plan key returned for the dev user — keeps callers from treating dev as "no plan". */
    static final String DEV_PLAN_KEY = "dev";

    /** Effectively unlimited cap for the dev user. */
    private static final int DEV_LIMIT = Integer.MAX_VALUE;

    private final KindeAccountApiClient kindeAccountApiClient;
    private final KindeBackendClient kindeBackendClient;

    /**
     * Returns the composed billing snapshot for the caller (plan + limit + used + period
     * bounds). Read-only: never writes back to Kinde. Safe to call from a frontend on
     * every modal-open / dashboard render.
     */
    public BillingProfileResponse getProfile(UUID userId, String externalUserId, String userAccessToken) {
        Instant now = Instant.now();
        if (DevPrincipal.EXTERNAL_USER_ID.equals(externalUserId)) {
            return new BillingProfileResponse(
                    userId, DEV_PLAN_KEY, DEV_LIMIT, 0, now, now.plus(30, ChronoUnit.DAYS));
        }

        Optional<KindeAccountApiClient.KindeEntitlements> ent =
                kindeAccountApiClient.fetchEntitlements(userAccessToken);
        if (ent.isEmpty() || ent.get().plans().isEmpty()) {
            return new BillingProfileResponse(userId, null, null, 0, now, now);
        }

        KindeAccountApiClient.KindeEntitlements e = ent.get();
        KindeAccountApiClient.KindePlan plan = e.plans().get(0);
        // Plan exists but Kinde hasn't populated `subscribed_on` yet (subscription pending
        // payment confirmation, or stale data after a delete/recreate cycle). Treat the
        // user as unsubscribed for display purposes — the frontend renders the same
        // "Subscribe" CTA as a brand-new user and avoids an NPE in period computation.
        if (plan.subscribedOn() == null) {
            return new BillingProfileResponse(userId, null, null, 0, now, now);
        }
        Integer limit = e.entitlements().stream()
                .filter(en -> REPORTS_FEATURE_KEY.equals(en.featureKey()))
                .map(KindeAccountApiClient.KindeEntitlement::maxUnits)
                .findFirst()
                .orElse(0);

        Instant periodStart = computePeriodStart(plan.subscribedOn(), now);
        Instant periodEnd = computePeriodEnd(periodStart);
        int used = readEffectiveUsage(externalUserId, periodStart);

        return new BillingProfileResponse(userId, plan.key(), limit, used, periodStart, periodEnd);
    }

    /**
     * Gates the "click Generate" action at the end of the wizard and increments the counter
     * if allowed. Called by {@code ReportController.startGeneration} BEFORE the frontend
     * fires the parallel Anthropic batch — no AI tokens get spent if the gate rejects.
     *
     * <ul>
     *   <li>No active plan → {@link SubscriptionRequiredException} (HTTP 402).</li>
     *   <li>Counter ≥ limit → {@link ReportLimitExceededException} (HTTP 429) with details
     *       so the frontend can render the paywall.</li>
     *   <li>Otherwise → increments the Kinde Property counter by one and returns silently.</li>
     * </ul>
     *
     * <p>Every call counts — there is intentionally no idempotency check on report status.
     * Regenerating a COMPLETED report also fires the AI batch again, so it must consume a
     * slot too. Concurrency: two parallel calls from the same user can both read the same
     * counter, both gate-check, both increment — last-writer-wins on the Property write.
     * In practice users don't generate parallel reports; if that changes we'll need to add
     * a distributed lock or use Kinde's idempotency mechanism.
     */
    public void recordGeneration(UUID userId, String externalUserId, String userAccessToken) {
        if (DevPrincipal.EXTERNAL_USER_ID.equals(externalUserId)) {
            // Dev user — no Kinde, unlimited.
            log.debug("Skipping generation gate for dev user");
            return;
        }

        Optional<KindeAccountApiClient.KindeEntitlements> ent =
                kindeAccountApiClient.fetchEntitlements(userAccessToken);
        if (ent.isEmpty() || ent.get().plans().isEmpty()) {
            throw new SubscriptionRequiredException("This action requires an active subscription.");
        }

        KindeAccountApiClient.KindeEntitlements e = ent.get();
        KindeAccountApiClient.KindePlan plan = e.plans().get(0);
        // Defensive: same null-subscribed_on case as in getProfile. Treat as "no plan"
        // and surface 402 with the same message — caller can't generate until the
        // subscription is fully active.
        if (plan.subscribedOn() == null) {
            throw new SubscriptionRequiredException("This action requires an active subscription.");
        }
        int limit = e.entitlements().stream()
                .filter(en -> REPORTS_FEATURE_KEY.equals(en.featureKey()))
                .map(KindeAccountApiClient.KindeEntitlement::maxUnits)
                .findFirst()
                .orElse(0);

        Instant now = Instant.now();
        Instant periodStart = computePeriodStart(plan.subscribedOn(), now);
        int currentUsage = readEffectiveUsage(externalUserId, periodStart);

        if (currentUsage >= limit) {
            throw new ReportLimitExceededException(limit, currentUsage, computePeriodEnd(periodStart));
        }

        int newUsage = currentUsage + 1;
        // Write back both keys together — Kinde's PATCH accepts a property map and applies
        // them atomically per-user. period_start updates only when it shifted (idempotent
        // for the common case where we're still in the same period).
        kindeBackendClient.updateUserProperties(
                externalUserId,
                Map.of(
                        USED_PROPERTY_KEY, String.valueOf(newUsage),
                        PERIOD_START_PROPERTY_KEY, periodStart.toString()));

        // Best-effort push to Kinde's billing meter so its own dashboard reflects real
        // usage (cosmetic today, foundation for overage billing later). Errors here are
        // caught and logged inside the client — Properties remain the source of truth
        // for our gating regardless of whether this succeeds.
        kindeBackendClient.recordMeterUsage(externalUserId, REPORTS_FEATURE_KEY, 1);

        log.debug("Recorded generation for user {} ({}/{} used)", userId, newUsage, limit);
    }

    /**
     * Reads the Kinde Properties counter and applies the period-reset rule: if the stored
     * {@code reports_period_start} differs from the {@code currentPeriodStart} we compute
     * from the entitlement's {@code subscribed_on}, the period has rolled over and the
     * effective counter is zero (the stale value gets overwritten the next time we write).
     *
     * <p>Defensive parsing on every read: missing key, blank value, unparseable integer,
     * or malformed instant all collapse to "0". Worst case we under-count once, which is
     * generous to the user.
     */
    private int readEffectiveUsage(String externalUserId, Instant currentPeriodStart) {
        Map<String, String> props = kindeBackendClient.fetchUserProperties(externalUserId);
        if (props.isEmpty()) return 0;

        String storedStart = props.get(PERIOD_START_PROPERTY_KEY);
        if (storedStart == null || storedStart.isBlank()) return 0;
        try {
            Instant stored = Instant.parse(storedStart);
            if (!stored.equals(currentPeriodStart)) return 0;
        } catch (Exception e) {
            log.warn("Could not parse {} property for user {}: {}", PERIOD_START_PROPERTY_KEY, externalUserId, e.getMessage());
            return 0;
        }

        String count = props.get(USED_PROPERTY_KEY);
        if (count == null || count.isBlank()) return 0;
        try {
            return Math.max(0, Integer.parseInt(count.trim()));
        } catch (NumberFormatException e) {
            log.warn("Could not parse {} property for user {}: {}", USED_PROPERTY_KEY, externalUserId, e.getMessage());
            return 0;
        }
    }

    /**
     * Most recent monthly anchor on or before {@code now}, computed by adding N whole months
     * to {@code subscribedOn}. Negative months (clock skew → now &lt; subscribedOn) collapse
     * to 0 so we never return a period-start in the future.
     */
    private static Instant computePeriodStart(Instant subscribedOn, Instant now) {
        ZonedDateTime sub = subscribedOn.atZone(ZoneOffset.UTC);
        ZonedDateTime cur = now.atZone(ZoneOffset.UTC);
        long monthsBetween = Math.max(0, ChronoUnit.MONTHS.between(sub, cur));
        return sub.plusMonths(monthsBetween).toInstant();
    }

    /** Exclusive end of the current period: the next monthly anchor after {@code periodStart}. */
    private static Instant computePeriodEnd(Instant periodStart) {
        return periodStart.atZone(ZoneOffset.UTC).plusMonths(1).toInstant();
    }
}
