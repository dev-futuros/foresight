package com.foresight.backend.report.dto;

import java.time.Instant;
import java.util.UUID;

import com.foresight.backend.report.Report;
import com.foresight.backend.report.ReportStatus;

/**
 * Lightweight projection of a {@link Report} used in list endpoints.
 *
 * <p>Intentionally omits the potentially-huge {@code inputData} and {@code resultData} JSON
 * blobs — the dashboard only needs the metadata.
 *
 * @param id        report UUID
 * @param title     human-readable title
 * @param status    current lifecycle status
 * @param createdAt creation timestamp
 * @param updatedAt last-modification timestamp
 */
public record ReportSummary(UUID id, String title, ReportStatus status, Instant createdAt, Instant updatedAt) {
    /**
     * Maps an entity into the list summary projection.
     *
     * @param r source entity
     * @return populated summary
     */
    public static ReportSummary from(Report r) {
        return new ReportSummary(r.getId(), r.getTitle(), r.getStatus(), r.getCreatedAt(), r.getUpdatedAt());
    }
}
