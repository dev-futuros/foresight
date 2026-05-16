package com.foresight.backend.example.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/reports/{reportId}/promote-to-example}.
 *
 * @param slug        stable kebab-case identifier. Required because it doubles
 *                    as the upsert key — re-promoting with the same slug
 *                    overwrites the existing example. Validation enforces a
 *                    reasonable URL-safe shape.
 * @param title       optional display title override. Defaults to the source
 *                    report's title when null/blank.
 * @param description optional one-liner shown under the title. Free-form.
 */
public record PromoteToExampleRequest(
        @NotBlank
                @Size(max = 120)
                @Pattern(
                        regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                        message = "slug must be kebab-case (lowercase, digits and single hyphens)")
                String slug,
        @Size(max = 500) String title,
        @Size(max = 2000) String description) {}
