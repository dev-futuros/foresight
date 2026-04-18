package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for {@code POST /api/ai/suggest-steep}.
 *
 * @param dimension      one of the five STEEP dimensions: {@code social}, {@code technological},
 *                       {@code economic}, {@code environmental}, {@code political}
 * @param companyProfile free-form description of the company/context used to anchor suggestions
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record SteepSuggestRequest(
        @NotBlank @Pattern(regexp = "^(social|technological|economic|environmental|political)$") String dimension,
        @NotBlank String companyProfile,
        String language) {}
