package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/auth/forgot-password}.
 *
 * <p>If the email matches a user, a single-use reset token is issued and emailed. Whether
 * the email exists or not, the endpoint responds identically (204) so callers cannot use
 * it to enumerate accounts.
 *
 * @param email address the user signs in with
 */
public record ForgotPasswordRequest(@Schema(example = "alice@example.com") @NotBlank @Email String email) {}
