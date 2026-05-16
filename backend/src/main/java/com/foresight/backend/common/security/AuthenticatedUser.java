package com.foresight.backend.common.security;

import java.util.UUID;

/**
 * Immutable snapshot of the authenticated caller, stored as the Spring Security principal.
 *
 * <p>Built by {@link JwtAuthFilter} after validating a JWT and injected into controllers via the
 * {@link CurrentUser} annotation. Kept minimal on purpose so we do not hit the database on every
 * request just to know who is calling. Email lives in the external identity provider (Clerk
 * pre-migration, Kinde post-migration) and is intentionally not mirrored here.
 *
 * @param id              the user's UUID (primary key)
 * @param externalUserId  stable identifier from the identity provider (useful for log correlation)
 * @param role            the user's role (e.g. {@code "USER"}, {@code "DEV"}, {@code "ADMIN"})
 */
public record AuthenticatedUser(UUID id, String externalUserId, String role) {}
