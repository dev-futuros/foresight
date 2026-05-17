package com.foresight.backend.billing;

/**
 * Thrown when an authenticated user without an active billing plan tries to access a paid
 * feature (currently: report generation). Mapped to HTTP 402 (Payment Required) by
 * {@code GlobalExceptionHandler}.
 *
 * <p>"Active plan" means {@link KindeAccountApiClient#fetchEntitlements(String)} returned at
 * least one entry in {@code plans[]}. A user who never picked a plan (e.g. signed up but
 * never subscribed) hits this; a user mid-trial does not (Kinde reports the plan as active
 * even during trial).
 */
public class SubscriptionRequiredException extends RuntimeException {
    public SubscriptionRequiredException(String message) {
        super(message);
    }
}
