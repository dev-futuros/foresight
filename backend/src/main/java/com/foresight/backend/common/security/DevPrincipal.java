package com.foresight.backend.common.security;

import java.util.UUID;

/**
 * Constants for the synthetic principal injected when
 * {@code foresight.security.auth-disabled=true} (local development only).
 *
 * <p>Kept as a separate type so the same UUID is referenced by the filter that injects it and
 * the seeder that creates the matching DB row at startup.
 */
public final class DevPrincipal {

    /** Stable UUID so reports created in dev mode are always owned by the same user. */
    public static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    /** Email used for the dev user in the database. */
    public static final String EMAIL = "dev@foresight.local";

    /** Display name. */
    public static final String NAME = "Dev User";

    /** Role granted to the dev principal. */
    public static final String ROLE = "USER";

    private DevPrincipal() {}
}
