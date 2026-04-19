package com.foresight.backend.auth.token;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import com.foresight.backend.common.domain.BaseEntity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Short-lived token that authorises a password reset.
 *
 * <p>Only the SHA-256 hash of the raw token is stored; see {@link TokenHasher} for the
 * rationale. Tokens are single-use: {@link #usedAt} is stamped at redemption and subsequent
 * lookups filter it out.
 */
@Entity
@Table(name = "password_reset_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordResetToken extends BaseEntity {

    /** FK to {@code users.id}. Declared {@code ON DELETE CASCADE} at the DB level. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** SHA-256 of the raw token (hex, 64 chars). */
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    /** Absolute expiration timestamp. The service rejects tokens past this instant. */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** When the token was redeemed; {@code null} while unused. */
    @Column(name = "used_at")
    private Instant usedAt;
}
