package com.foresight.backend.common.security;

import java.util.UUID;

/**
 * Immutable snapshot of the authenticated caller, stored as the Spring Security principal.
 *
 * <p>Built by {@link JwtAuthFilter} after validating a JWT and injected into controllers via the
 * {@link CurrentUser} annotation. Kept minimal on purpose so we do not hit the database on every
 * request just to know who is calling.
 *
 * @param id    the user's UUID (primary key)
 * @param email the user's email, for logging and trivial lookups
 * @param role  the user's role (e.g. {@code "USER"}, {@code "ADMIN"})
 */
public record AuthenticatedUser(UUID id, String email, String role) {}
