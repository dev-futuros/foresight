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
 * <p>Authentication is delegated to an external identity provider (currently Clerk, Kinde
 * post-migration): passwords, email verification, MFA, and session management all live there.
 * Email is also the provider's responsibility — the local row only mirrors the profile fields
 * the app actually consumes (name, role, language) plus a stable {@code externalUserId} that
 * links the local row to the provider's user. That id is what we look up when validating an
 * incoming session JWT.
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
     * Stable identifier of the user in the external identity provider — currently Clerk
     * (e.g. {@code user_2abc...}), Kinde post-migration (e.g. {@code kp_2abc...}). Populated
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

    /** Optional display name, mirrored from Clerk. */
    private String name;

    /** Authorization role (currently {@code USER} or {@code ADMIN}). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    /** Preferred UI language (e.g. {@code "es"}, {@code "en"}). */
    @Column(nullable = false)
    private String language;
}
