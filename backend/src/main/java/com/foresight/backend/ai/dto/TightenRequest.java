package com.foresight.backend.ai.dto;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/tighten} — shorten a piece of report text so it fits a
 * specific PDF layout budget.
 *
 * <p>Used by the PDF export pipeline when content is close to fitting a tighter layout but
 * exceeds its character budget. Backend asks Haiku to rewrite the text shorter while preserving
 * the meaning + key terms; result gets cached per-language on the report row so subsequent
 * exports skip the round trip.
 *
 * @param text          the source text to shorten — typically a paragraph or two of report prose
 * @param targetChars   maximum character count the response should fit in. Soft target — the
 *                      model is told to aim at this; in practice it can come in slightly under.
 *                      Clamped to [80, 8000] to prevent degenerate calls (single word / book).
 * @param language      output language tag ({@code "en"} or {@code "es"}); defaults to Spanish
 * @param preserveTerms optional list of domain terms / proper nouns the model MUST keep verbatim
 *                      (e.g. company name, key statistics, percentages, regulation names).
 *                      Up to 32 entries — anything beyond that is structurally suspect.
 */
public record TightenRequest(
        @Schema(
                        example =
                                "Brutto enters an artisanal bakery market where structural tailwinds are accelerating: the Europe sourdough market was valued at USD 0.83 billion in 2024…",
                        description = "Source text to shorten. 1-3 paragraphs typical.")
                @NotBlank
                @Size(max = 12000)
                String text,
        @Schema(example = "900", description = "Target maximum character count for the shortened text.")
                @Min(80)
                @Max(8000)
                int targetChars,
        @Schema(example = "en", description = "Optional. 'en' or 'es' (default).") String language,
        @Schema(
                        example = "[\"Brutto\", \"Bellver de Cerdanya\", \"5.82%\"]",
                        description = "Optional. Up to 32 terms the model must keep verbatim in the output.")
                @Size(max = 32)
                List<@NotBlank @Size(max = 200) String> preserveTerms) {}
