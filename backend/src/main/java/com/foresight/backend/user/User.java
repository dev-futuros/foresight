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
 * <p>Passwords are stored as BCrypt hashes — never in plaintext. The {@code password} column
 * value is only ever written by {@link com.foresight.backend.auth.AuthService} and read by the
 * security layer to verify credentials; it is never returned by any DTO.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    /** Unique email address used as the login identifier. */
    @Column(nullable = false, unique = true)
    private String email;

    /** BCrypt-hashed password. Never exposed via API. */
    @Column(nullable = false)
    private String password;

    /** Optional display name. */
    private String name;

    /** Authorization role (currently {@code USER} or {@code ADMIN}). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    /** Preferred UI language (e.g. {@code "es"}, {@code "en"}). */
    @Column(nullable = false)
    private String language;

    /** Whether the user has verified their email address. Reserved for future email flow. */
    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;
}
