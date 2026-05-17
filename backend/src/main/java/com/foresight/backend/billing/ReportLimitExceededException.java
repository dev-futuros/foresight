package com.foresight.backend.billing;

import java.time.Instant;

/**
 * Thrown when a user hits the per-period cap on their plan's
 * {@code reports_per_periodo} entitlement and tries to create one more.
 *
 * <p>Mapped to HTTP 429 by {@code GlobalExceptionHandler} with a body that carries the
 * three numbers the frontend needs to render the paywall ({@code limit}, {@code used},
 * {@code periodEnd}) — see {@code ApiError.details}.
 */
public class ReportLimitExceededException extends RuntimeException {

    private final int limit;
    private final int used;
    private final Instant periodEnd;

    public ReportLimitExceededException(int limit, int used, Instant periodEnd) {
        super("Report generation limit reached for the current period (" + used + "/" + limit + ").");
        this.limit = limit;
        this.used = used;
        this.periodEnd = periodEnd;
    }

    public int getLimit() {
        return limit;
    }

    public int getUsed() {
        return used;
    }

    public Instant getPeriodEnd() {
        return periodEnd;
    }
}
