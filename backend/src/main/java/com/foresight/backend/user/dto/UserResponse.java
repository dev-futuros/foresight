package com.foresight.backend.user.dto;

import java.util.UUID;

import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRole;

/**
 * Public projection of a {@link User}.
 *
 * <p>Explicitly omits the password hash and any internal audit fields that are not useful to
 * clients. Every field here is safe to send to the frontend.
 *
 * @param id            user UUID
 * @param email         login email
 * @param name          display name (may be {@code null})
 * @param role          authorization role
 * @param language      preferred UI language
 * @param emailVerified whether the email has been verified
 */
public record UserResponse(UUID id, String email, String name, UserRole role, String language, boolean emailVerified) {
    /**
     * Builds a response from an entity. Kept as a static factory so the mapping lives next
     * to the DTO it produces.
     *
     * @param u source entity
     * @return populated response
     */
    public static UserResponse from(User u) {
        return new UserResponse(
                u.getId(), u.getEmail(), u.getName(), u.getRole(), u.getLanguage(), u.isEmailVerified());
    }
}
