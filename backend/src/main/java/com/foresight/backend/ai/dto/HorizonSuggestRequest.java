package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for {@code POST /api/ai/suggest-horizon}.
 *
 * @param horizon        one of {@code H1} (0-2y), {@code H2} (2-5y), {@code H3} (5y+)
 * @param companyProfile free-form description of the company/context used to anchor suggestions
 * @param language       optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record HorizonSuggestRequest(
        @NotBlank @Pattern(regexp = "^(H1|H2|H3)$") String horizon, @NotBlank String companyProfile, String language) {}
