package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/login}.
 *
 * @param email    registered email address
 * @param password plaintext password, checked server-side against the BCrypt hash
 */
public record LoginRequest(
        @Schema(example = "alice@example.com") @NotBlank @Email String email,
        @Schema(example = "S3cret!LongEnough") @NotBlank String password) {}
