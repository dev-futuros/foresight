package com.foresight.backend.user.dto;

import java.util.UUID;

import com.foresight.backend.user.UserRole;

/**
 * Public projection of the authenticated user's profile.
 *
 * <p>Composed by {@code UserService.getProfile} from two sources:
 *
 * <ul>
 *   <li>{@code id} and {@code role} come from the local {@code users} row — they're the
 *       only profile fields we still store locally (role for hot-path authorization,
 *       id for FK joins).</li>
 *   <li>{@code name}, {@code email}, {@code picture} come from Kinde stock fields
 *       ({@code first_name}/{@code last_name}/{@code preferred_email}/{@code picture}),
 *       fetched via {@code KindeBackendClient.fetchUser}.</li>
 *   <li>{@code language} comes from the Kinde Property {@code language}, fetched via
 *       {@code KindeBackendClient.fetchUserProperties}. Defaulted to {@code "es"} when
 *       the user hasn't picked a value (or when running in dev mode without Kinde).</li>
 * </ul>
 *
 * <p>{@code externalUserId} is intentionally omitted: clients identify the current user
 * through Kinde on their side and use this UUID as the foreign key into our reports etc.
 *
 * @param id       user UUID (foreign-key target for reports etc.)
 * @param name     display name composed from Kinde first/last (may be {@code null})
 * @param email    Kinde's {@code preferred_email} (may be {@code null} in dev mode)
 * @param picture  Kinde profile picture URL (may be {@code null} when the user hasn't set one)
 * @param role     authorization role (sourced locally)
 * @param language Kinde Property {@code language}, defaulted to {@code "es"}
 */
public record UserResponse(
        UUID id, String name, String email, String picture, UserRole role, String language) {}
