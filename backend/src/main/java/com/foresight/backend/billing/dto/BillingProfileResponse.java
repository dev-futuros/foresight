package com.foresight.backend.billing.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Composed billing snapshot for the authenticated user. Built by {@code BillingService.getProfile}
 * by joining Kinde Account API data (plan + per-feature limits) with the local report count
 * for the current billing period.
 *
 * <p>Shape kept flat so the frontend can render the paywall, quota chip and pricing CTA from
 * a single payload without ad-hoc client-side computation.
 *
 * @param userId         the caller's local UUID — round-trip helper for the frontend's TanStack
 *                       Query cache keying.
 * @param plan           Kinde plan key (e.g. {@code "pro"}) or {@code null} when the user has
 *                       no active subscription (free user — gated out of paid features).
 * @param reportsLimit   per-period cap from {@code reports_per_periodo} entitlement. {@code null}
 *                       only when {@code plan == null}; otherwise the integer set in Kinde.
 * @param reportsUsed    number of reports the user has created since {@code periodStart} (counted
 *                       from the local {@code reports} table — Kinde doesn't expose this via
 *                       the Account API).
 * @param periodStart    inclusive timestamp the current monthly period began (anchored to
 *                       {@code subscribed_on} day-of-month).
 * @param periodEnd      exclusive timestamp the current period ends — same anchor + 1 month.
 *                       Frontend can show "renews in X days" without re-computing.
 */
public record BillingProfileResponse(
        UUID userId, String plan, Integer reportsLimit, int reportsUsed, Instant periodStart, Instant periodEnd) {}
