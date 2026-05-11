package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotNull;

import com.fasterxml.jackson.databind.JsonNode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body shared by the four downstream analysis endpoints
 * ({@code scenario-planning}, {@code backcasting}, {@code strategic-map},
 * {@code sources}).
 *
 * <p>Mirrors {@link AnalyzeRequest} but adds an optional {@code scenarios}
 * field carrying the 3P scenarios already produced by the base
 * {@code /api/ai/analyze} call. Passing them in lets the model anchor the
 * downstream analysis on the same scenarios the user just saw, rather than
 * reinventing them inconsistently for each pass — the cost of an extra
 * payload tier is negligible compared to the model coherence we gain.
 *
 * <p>{@code scenarios} is optional because the {@code sources} endpoint
 * doesn't need them.
 *
 * @param companyProfile JSON describing the company/context
 * @param steep          JSON with the STEEP analysis (factors per dimension)
 * @param horizon        JSON with horizon signals (H1/H2/H3)
 * @param scenarios      OPTIONAL JSON with the 3P scenarios returned by the base call
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record AnalyzeContextRequest(
        @NotNull JsonNode companyProfile,
        @NotNull JsonNode steep,
        @NotNull JsonNode horizon,
        @Schema(
                description = "Scenarios already produced by /api/ai/analyze, passed in so the"
                        + " downstream analysis stays consistent with what the user has already"
                        + " seen. Optional; omit for the sources call.")
                JsonNode scenarios,
        @Schema(
                description = "Dated research bullets gathered by /analyze/scan up front."
                        + " When present, section calls anchor on these shared facts instead of"
                        + " each firing their own web_search loop.")
                String research,
        @Schema(example = "es") String language) {}
