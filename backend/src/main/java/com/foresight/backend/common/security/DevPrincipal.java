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

    /**
     * Synthetic Clerk id for the dev user — not a real Clerk identifier, just a stable
     * placeholder that satisfies the NOT NULL / UNIQUE constraint on {@code clerk_user_id}.
     */
    public static final String CLERK_USER_ID = "user_local_dev";

    /** Display name. */
    public static final String NAME = "Dev User";

    /** Role granted to the dev principal. */
    public static final String ROLE = "USER";

    private DevPrincipal() {}
}
