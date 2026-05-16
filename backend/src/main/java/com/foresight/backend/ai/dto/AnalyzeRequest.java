package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotNull;

import com.fasterxml.jackson.databind.JsonNode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/analyze}.
 *
 * <p>Each of the three JSON sections is passed through verbatim to Claude — the backend does
 * not impose a schema, allowing the frontend to evolve the shape without a server deploy.
 *
 * @param companyProfile JSON describing the company/context
 * @param steep          JSON with the STEEP analysis (factors per dimension)
 * @param horizon        JSON with horizon signals (H1/H2/H3)
 * @param research       optional bundle of dated research bullets gathered by
 *                       {@code /analyze/scan} up front. When present, the 5
 *                       analyze section calls fold it into their user prompt
 *                       so they can anchor on the same shared facts (and skip
 *                       their own web_search loop, saving 4× the search budget).
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record AnalyzeRequest(
        @Schema(
                        example =
                                """
                                {"name": "Acme Mobility", "industry": "Urban transport", "geography": "EU"}
                                """)
                @NotNull
                JsonNode companyProfile,
        @Schema(
                        example =
                                """
                                {
                                  "social": ["Shift to multimodal commuting"],
                                  "technological": ["Battery density +18% YoY"],
                                  "economic": ["Fuel price volatility"],
                                  "environmental": ["Low-emission zones expanding"],
                                  "political": ["EU CBAM compliance"]
                                }
                                """)
                @NotNull
                JsonNode steep,
        @Schema(
                        example =
                                """
                                {
                                  "H1": ["EV subsidies renewed in FR/DE"],
                                  "H2": ["Autonomous shuttles pilot in Barcelona"],
                                  "H3": ["Vertiport network in Tier-1 cities"]
                                }
                                """)
                @NotNull
                JsonNode horizon,
        @Schema(description = "Dated research bullets from /analyze/scan. Optional.") String research,
        @Schema(example = "es") String language) {}
