package com.foresight.backend.user.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code PATCH /api/users/me}.
 *
 * <p>All fields are optional — {@code null} means "leave this field unchanged".
 *
 * @param name     new display name (max 255 chars)
 * @param language new preferred language; must be {@code "es"} or {@code "en"}
 */
public record UpdateUserRequest(
        @Schema(example = "Alice A.", maxLength = 255) @Size(max = 255) String name,
        @Schema(
                        example = "en",
                        allowableValues = {"es", "en"})
                @Pattern(regexp = "^(es|en)$", message = "language must be 'es' or 'en'")
                String language) {}
