package com.foresight.backend.report.dto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code PUT /api/reports/{id}/pdf-optimized/{language}} — replaces the
 * per-language entry in the report's {@code pdf_optimized} cache.
 *
 * <p>Sent by the PDF export pipeline after it has finished asking {@code /api/ai/tighten} for
 * every field it needs to shorten. The map keys are dotted paths into the report's
 * {@code resultData} / {@code inputData} (e.g. {@code "executiveSummary"},
 * {@code "scenarios.0.firstMove"}), values are the tightened strings.
 *
 * @param fields shortened prose keyed by dotted JSON path; up to ~50 entries in practice
 */
public record PdfOptimizedUpdate(
        @Schema(
                        example = "{\"executiveSummary\": \"…\", \"scenarios.0.firstMove\": \"Within 30 days…\"}",
                        description = "Tightened-text map: dotted JSON paths into the report → shortened text.")
                @NotNull
                @Size(max = 200)
                Map<
                                @NotBlank @Pattern(regexp = "^[A-Za-z0-9._\\-]{1,200}$") String,
                                @NotNull @Size(max = 8000) String>
                        fields) {}
