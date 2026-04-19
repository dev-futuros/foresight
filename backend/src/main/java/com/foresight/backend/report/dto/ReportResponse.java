package com.foresight.backend.report.dto;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.report.Report;
import com.foresight.backend.report.ReportStatus;

/**
 * Full projection of a {@link Report} used for detail views.
 *
 * <p>Includes both {@code inputData} and {@code resultData} — can be large. For list views, use
 * {@link ReportSummary} instead.
 *
 * @param id         report UUID
 * @param title      human-readable title
 * @param status     current lifecycle status
 * @param inputData  JSON inputs provided by the user
 * @param resultData JSON output produced by the AI (may be {@code null})
 * @param createdAt  creation timestamp
 * @param updatedAt  last-modification timestamp
 */
public record ReportResponse(
        UUID id,
        String title,
        ReportStatus status,
        JsonNode inputData,
        JsonNode resultData,
        Instant createdAt,
        Instant updatedAt) {
    /**
     * Maps an entity into the full response projection.
     *
     * @param r source entity
     * @return populated response
     */
    public static ReportResponse from(Report r) {
        return new ReportResponse(
                r.getId(),
                r.getTitle(),
                r.getStatus(),
                r.getInputData(),
                r.getResultData(),
                r.getCreatedAt(),
                r.getUpdatedAt());
    }
}
