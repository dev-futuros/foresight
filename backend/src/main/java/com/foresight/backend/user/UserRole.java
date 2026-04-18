package com.foresight.backend.user;

/**
 * Role assigned to each user account.
 *
 * <p>Stored as a {@code VARCHAR} in the {@code users.role} column via
 * {@code @Enumerated(EnumType.STRING)}. Using an enum instead of a raw string prevents
 * typos and gives us compile-time safety when checking roles.
 */
public enum UserRole {
    /** Default role for regular application users. */
    USER,
    /** Administrator with elevated privileges (reserved for future use). */
    ADMIN
}
