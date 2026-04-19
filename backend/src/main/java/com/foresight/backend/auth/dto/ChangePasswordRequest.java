package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/change-password}.
 *
 * <p>Used by an already-logged-in user to rotate their password. The current password is
 * required so the endpoint is safe even if the caller's JWT is reused from a compromised
 * device — an attacker with only the token cannot pivot into a password change.
 *
 * @param currentPassword the plaintext password the user logs in with today
 * @param newPassword     the new plaintext password (BCrypt hard limit 72 chars)
 */
public record ChangePasswordRequest(
        @Schema(example = "S3cret!LongEnough") @NotBlank String currentPassword,
        @Schema(example = "EvenL0nger!Secret", minLength = 8, maxLength = 72) @NotBlank @Size(min = 8, max = 72)
                String newPassword) {}
