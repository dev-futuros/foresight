package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/global-steep}.
 *
 * <p>Drives a Claude call with the {@code web_search} tool enabled so the global STEEP
 * snapshot is grounded on current data (geopolitics, commodity prices, regulation, etc.)
 * filtered by sector.
 *
 * <p>When {@code dimension} is set, only that single STEEP key is regenerated — useful for
 * the per-card "regenerate" affordance in the wizard. When {@code null}, all five
 * dimensions are returned in one shot (initial load behaviour).
 *
 * @param sector    the company's sector — used to filter macro signals (free-form text)
 * @param language  optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 * @param dimension optional STEEP key to refresh in isolation: one of {@code S}, {@code T},
 *                  {@code E}, {@code ENV}, {@code P}; {@code null} returns all
 */
public record GlobalSteepRequest(
        @Schema(example = "Movilidad urbana eléctrica") @NotBlank @Size(max = 200) String sector,
        @Schema(example = "es", description = "Optional. 'en' or 'es' (default).") String language,
        @Schema(
                        example = "P",
                        description = "Optional. One of S, T, E, ENV, P. If set, only that key is returned.")
                @Pattern(regexp = "S|T|E|ENV|P")
                String dimension) {}
