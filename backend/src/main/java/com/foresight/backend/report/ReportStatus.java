package com.foresight.backend.report;

/**
 * Lifecycle state of a foresight report.
 *
 * <p>Stored as {@code VARCHAR} in the {@code reports.status} column.
 */
public enum ReportStatus {
    /** Initial state: inputs saved but no AI analysis has been run yet. */
    DRAFT,
    /** An AI analysis is currently running. Reserved for async flows. */
    PROCESSING,
    /** Analysis finished successfully; {@code result_data} is populated. */
    COMPLETED,
    /** Analysis attempted but failed; may be retried. */
    FAILED
}
