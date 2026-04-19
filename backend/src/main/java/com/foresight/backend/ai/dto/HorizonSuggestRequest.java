package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/suggest-horizon}.
 *
 * @param horizon        one of {@code H1} (0-2y), {@code H2} (2-5y), {@code H3} (5y+)
 * @param companyProfile free-form description of the company/context used to anchor suggestions
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record HorizonSuggestRequest(
        @Schema(
                        example = "H2",
                        description = "Time horizon: H1 (0-2y), H2 (2-5y), H3 (5y+).",
                        allowableValues = {"H1", "H2", "H3"})
                @NotBlank
                @Pattern(regexp = "^(H1|H2|H3)$")
                String horizon,
        @Schema(
                        example =
                                "Acme Mobility — mid-size European operator of shared electric scooters, 15 cities, 4M rides/year.")
                @NotBlank
                String companyProfile,
        @Schema(example = "es") String language) {}
