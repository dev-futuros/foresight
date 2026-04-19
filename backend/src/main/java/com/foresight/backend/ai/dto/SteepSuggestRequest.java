package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/suggest-steep}.
 *
 * @param dimension      one of the five STEEP dimensions: {@code social}, {@code technological},
 *                       {@code economic}, {@code environmental}, {@code political}
 * @param companyProfile free-form description of the company/context used to anchor suggestions
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record SteepSuggestRequest(
        @Schema(
                        example = "technological",
                        allowableValues = {"social", "technological", "economic", "environmental", "political"})
                @NotBlank
                @Pattern(regexp = "^(social|technological|economic|environmental|political)$")
                String dimension,
        @Schema(
                        example =
                                "Acme Mobility — mid-size European operator of shared electric scooters, 15 cities, 4M rides/year.")
                @NotBlank
                String companyProfile,
        @Schema(example = "es", description = "Optional. 'en' or 'es' (default).") String language) {}
