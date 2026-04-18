package com.foresight.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/auth/register}.
 *
 * @param email    user's email; must be a valid address and unique in the system
 * @param password plaintext password (min 8, max 72 chars — BCrypt's hard limit)
 * @param name     optional display name
 * @param language preferred UI language (e.g. {@code "es"}, {@code "en"}); defaults to {@code "es"} if null
 */
public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 8, max = 72) String password,
        @Size(max = 255) String name,
        @Size(max = 8) String language) {}
