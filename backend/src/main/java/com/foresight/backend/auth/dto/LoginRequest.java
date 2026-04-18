package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/auth/login}.
 *
 * @param email    registered email address
 * @param password plaintext password, checked server-side against the BCrypt hash
 */
public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
