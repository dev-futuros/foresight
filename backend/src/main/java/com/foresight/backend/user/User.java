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
 * <p>Authentication is delegated to Clerk: passwords, email verification, MFA, and session
 * management all live there. The local row only carries the profile fields the rest of the app
 * needs (email, name, role, language) plus a stable {@code clerkUserId} that links the local row
 * to the Clerk user — this is the column we look up by when validating an incoming session JWT.
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
     * Clerk's stable user identifier (e.g. {@code user_2abc...}). Populated either by the
     * {@code user.created} webhook or, lazily, on the first authenticated API call from a
     * brand-new Clerk user. Unique and non-null for any user that has authenticated at least once.
     */
    @Column(name = "clerk_user_id", nullable = false, unique = true)
    private String clerkUserId;

    /** Primary email address mirrored from Clerk. */
    @Column(nullable = false, unique = true)
    private String email;

    /** Optional display name. */
    private String name;

    /** Authorization role (currently {@code USER} or {@code ADMIN}). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    /** Preferred UI language (e.g. {@code "es"}, {@code "en"}). */
    @Column(nullable = false)
    private String language;
}
