package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/verify-email}.
 *
 * @param token the single-use verification token the user received by email
 */
public record VerifyEmailRequest(
        @Schema(example = "Q0RGS3Q3ZzU5...", description = "Opaque token from the verification email.") @NotBlank
                String token) {}
