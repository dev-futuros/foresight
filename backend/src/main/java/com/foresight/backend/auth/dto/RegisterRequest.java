package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/register}.
 *
 * @param email    user's email; must be a valid address and unique in the system
 * @param password plaintext password (min 8, max 72 chars — BCrypt's hard limit)
 * @param name     optional display name
 * @param language preferred UI language (e.g. {@code "es"}, {@code "en"}); defaults to {@code "es"} if null
 */
public record RegisterRequest(
        @Schema(example = "alice@example.com") @NotBlank @Email @Size(max = 255) String email,
        @Schema(example = "S3cret!LongEnough", minLength = 8, maxLength = 72) @NotBlank @Size(min = 8, max = 72)
                String password,
        @Schema(example = "Alice Analyst") @Size(max = 255) String name,
        @Schema(example = "es", description = "UI language. Defaults to 'es' if omitted.") @Size(max = 8)
                String language) {}
