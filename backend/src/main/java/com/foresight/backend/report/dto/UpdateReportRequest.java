package com.foresight.backend.report.dto;

import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.databind.JsonNode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code PATCH /api/reports/{id}}.
 *
 * <p>All fields are optional — {@code null} means "leave unchanged". Used both to rename a
 * report, tweak its inputs, and to attach the AI result.
 *
 * @param title      new title, or {@code null} to keep the current one
 * @param inputData  replacement inputs document, or {@code null}
 * @param resultData replacement result document (set after AI finishes), or {@code null}
 */
public record UpdateReportRequest(
        @Schema(example = "Q3 2026 strategic foresight — v2 (after workshop feedback)", maxLength = 500)
                @Size(max = 500)
                String title,
        @Schema(
                        description = "Optional. Replaces the inputData JSON entirely if provided.",
                        example =
                                """
                                {
                                  "companyProfile": {"name": "Acme Mobility"},
                                  "steep": {"social": ["Updated factor"]}
                                }
                                """)
                JsonNode inputData,
        @Schema(
                        description = "Optional. Typically set by the backend after the AI analysis completes.",
                        example =
                                """
                                {
                                  "scenarios": [
                                    {"name": "Rapid electrification", "probability": 0.45},
                                    {"name": "Regulatory slowdown", "probability": 0.30}
                                  ]
                                }
                                """)
                JsonNode resultData) {}
