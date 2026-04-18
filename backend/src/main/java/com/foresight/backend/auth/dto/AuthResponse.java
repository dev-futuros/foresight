package com.foresight.backend.auth.dto;

import com.foresight.backend.user.dto.UserResponse;

/**
 * Response body returned by both {@code /api/auth/register} and {@code /api/auth/login}.
 *
 * @param accessToken signed JWT the client must send on subsequent requests
 *                    as {@code Authorization: Bearer <token>}
 * @param expiresIn   token lifetime in seconds (helps the client schedule refresh/re-auth)
 * @param user        lightweight projection of the authenticated user
 */
public record AuthResponse(String accessToken, long expiresIn, UserResponse user) {}
