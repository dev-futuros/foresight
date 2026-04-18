package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotNull;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Request body for {@code POST /api/ai/analyze}.
 *
 * <p>Each of the three JSON sections is passed through verbatim to Claude — the backend does
 * not impose a schema, allowing the frontend to evolve the shape without a server deploy.
 *
 * @param companyProfile JSON describing the company/context
 * @param steep          JSON with the STEEP analysis (factors per dimension)
 * @param horizon        JSON with horizon signals (H1/H2/H3)
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record AnalyzeRequest(
        @NotNull JsonNode companyProfile, @NotNull JsonNode steep, @NotNull JsonNode horizon, String language) {}
