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
    /**
     * Internal developer account. Reserved for the team — bypasses the subscription
     * gate that lands with the Stripe branch. Declared here ahead of that merge so
     * Hibernate can hydrate rows with {@code role='DEV'} without exploding (the column
     * is {@code VARCHAR} with no CHECK, so a DEV value can already exist in any DB
     * that was pointed at the Stripe branch). No code path in this branch assigns it;
     * promotion happens by direct DB update.
     */
    DEV,
    /** Administrator with elevated privileges (reserved for future use). */
    ADMIN
}
