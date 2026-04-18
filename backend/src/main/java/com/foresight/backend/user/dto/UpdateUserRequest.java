package com.foresight.backend.user.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code PATCH /api/users/me}.
 *
 * <p>All fields are optional — {@code null} means "leave this field unchanged".
 *
 * @param name     new display name (max 255 chars)
 * @param language new preferred language; must be {@code "es"} or {@code "en"}
 */
public record UpdateUserRequest(
        @Size(max = 255) String name,
        @Pattern(regexp = "^(es|en)$", message = "language must be 'es' or 'en'") String language) {}
