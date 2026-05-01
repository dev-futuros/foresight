package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/global-steep}.
 *
 * <p>Drives a Claude call with the {@code web_search} tool enabled so the global STEEP
 * snapshot is grounded on current data (geopolitics, commodity prices, regulation, etc.)
 * filtered by sector.
 *
 * @param sector   the company's sector — used to filter macro signals (free-form text)
 * @param language optional language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 */
public record GlobalSteepRequest(
        @Schema(example = "Movilidad urbana eléctrica") @NotBlank @Size(max = 200) String sector,
        @Schema(example = "es", description = "Optional. 'en' or 'es' (default).") String language) {}
