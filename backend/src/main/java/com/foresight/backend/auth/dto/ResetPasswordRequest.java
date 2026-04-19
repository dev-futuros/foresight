package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/reset-password}.
 *
 * @param token       the single-use reset token the user received by email
 * @param newPassword the new plaintext password (BCrypt hard limit 72 chars)
 */
public record ResetPasswordRequest(
        @Schema(example = "Q0RGS3Q3ZzU5...", description = "Opaque token from the reset email.") @NotBlank String token,
        @Schema(example = "EvenL0nger!Secret", minLength = 8, maxLength = 72) @NotBlank @Size(min = 8, max = 72)
                String newPassword) {}
