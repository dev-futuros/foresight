package com.foresight.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/global-steep-dim} — the second
 * phase of the split Global STEEP flow.
 *
 * <p>The first phase ({@code /api/ai/global-steep-scan}) runs ONE
 * web-search-enabled call that gathers dated bullets for all five
 * dimensions in a single JSON. This phase takes the raw bullets for one
 * specific dimension and reformulates them into clean prose suitable for
 * the user's STEEP textarea — five of these run in parallel client-side,
 * one per dimension, with no further web search needed.
 *
 * @param sector    the company's sector — passed through for prompt context
 * @param language  {@code "en"} or {@code "es"} (default Spanish)
 * @param dimension which STEEP key this call is reformulating; one of
 *                  {@code S}, {@code T}, {@code E}, {@code ENV}, {@code P}
 * @param snippet   the raw bullets produced by the upstream scan for this
 *                  dimension (may be empty if the scan fell back; the
 *                  model still produces something reasonable)
 */
public record GlobalSteepDimRequest(
        @Schema(example = "Movilidad urbana eléctrica") @NotBlank @Size(max = 200) String sector,
        @Schema(example = "es", description = "Optional. 'en' or 'es' (default).") String language,
        @Schema(example = "P", description = "STEEP dimension key being reformulated.")
                @NotBlank
                @Pattern(regexp = "S|T|E|ENV|P")
                String dimension,
        @Schema(description = "Raw dated bullets for this dimension from the upstream scan call.") @Size(max = 4000)
                String snippet) {}
