package com.foresight.backend.report.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.databind.JsonNode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/reports}.
 *
 * @param title     user-chosen title (max 500 chars)
 * @param inputData arbitrary JSON document capturing the wizard inputs (company profile,
 *                  STEEP factors, horizon signals). Shape is intentionally flexible.
 */
public record CreateReportRequest(
        @Schema(example = "Q3 2026 strategic foresight — European mobility market", maxLength = 500)
                @NotBlank
                @Size(max = 500)
                String title,
        @Schema(
                        description = "Free-form JSON capturing the wizard inputs. Any shape accepted.",
                        example =
                                """
                                {
                                  "companyProfile": {
                                    "name": "Acme Mobility",
                                    "industry": "Urban transport",
                                    "geography": "EU"
                                  },
                                  "steep": {
                                    "social": ["Shift to multimodal commuting"],
                                    "technological": ["Battery density +18% YoY"]
                                  },
                                  "horizon": {
                                    "H1": ["EV subsidies renewed in FR/DE"],
                                    "H2": ["Autonomous shuttles pilot in Barcelona"]
                                  }
                                }
                                """)
                @NotNull
                JsonNode inputData) {}
