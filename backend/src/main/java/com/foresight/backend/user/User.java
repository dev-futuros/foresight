package com.foresight.backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.foresight.backend.common.domain.BaseEntity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA entity representing an application user.
 *
 * <p>Inherits {@code id} (UUID), {@code createdAt} and {@code updatedAt} from {@link BaseEntity}.
 *
 * <p>Authentication AND profile data are delegated to Kinde — the local row is intentionally
 * thin: it only holds what we need to join business data (reports, subscriptions) and to
 * enforce authorization. Specifically:
 *
 * <ul>
 *   <li>{@code id} (UUID, inherited) — foreign-key target for every owned resource.</li>
 *   <li>{@code externalUserId} — pointer back into Kinde's user store.</li>
 *   <li>{@code role} — authorization concern; checked on every request, would be too
 *       expensive to fetch from Kinde Properties each time.</li>
 *   <li>{@code createdAt} / {@code updatedAt} (inherited) — local audit timestamps.</li>
 * </ul>
 *
 * <p>Profile fields that used to live here — {@code name} (V1) and {@code language} (V1) —
 * moved out in V13. {@code name} is now read from Kinde's stock {@code first_name} /
 * {@code last_name} fields; {@code language} is now a Kinde Property
 * ({@code GET /api/v1/users/{user_id}/properties}). See {@code UserService.getProfile}
 * for how these are joined back together into the {@code UserResponse} surface.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    /**
     * Stable identifier of the user in the external identity provider — Kinde
     * (e.g. {@code kp_2abc...}). Populated
     * either by the {@code user.*} webhook from the provider or, lazily, on the first
     * authenticated API call from a brand-new user. Unique and non-null for any user that
     * has authenticated at least once.
     *
     * <p>The DB column was renamed from {@code clerk_user_id} to {@code external_user_id}
     * in V12 to make the schema provider-agnostic — see
     * {@code docs/MIGRATION_CLERK_TO_KINDE.md}.
     */
    @Column(name = "external_user_id", nullable = false, unique = true)
    private String externalUserId;

    /** Authorization role (currently {@code USER} or {@code ADMIN}). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;
}
