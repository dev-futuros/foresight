package com.foresight.backend.user.dto;

import java.util.UUID;

import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRole;

/**
 * Public projection of a {@link User}.
 *
 * <p>Every field here is safe to send to the frontend. The {@code clerkUserId} is intentionally
 * omitted: clients identify the current user through Clerk on their side and the local UUID is
 * what every other API uses as a foreign key. Email lives in Clerk and the frontend reads it
 * from there.
 *
 * @param id user UUID (foreign-key target for reports etc.)
 * @param name display name (may be {@code null})
 * @param role authorization role
 * @param language preferred UI language
 */
public record UserResponse(UUID id, String name, UserRole role, String language) {
    public static UserResponse from(User u) {
        return new UserResponse(u.getId(), u.getName(), u.getRole(), u.getLanguage());
    }
}
