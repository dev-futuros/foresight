package com.foresight.backend.auth.token;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Spring Data repository for {@link PasswordResetToken}.
 */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    /**
     * @param tokenHash SHA-256 of the raw token provided by the user
     * @return the matching token (used or not, expired or not) — caller validates state
     */
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Invalidates any still-unused tokens for the given user. Called before issuing a new
     * one so a user only ever has one live reset link at a time.
     *
     * @param userId user whose unused tokens should be marked used now
     */
    @Modifying
    @Query("UPDATE PasswordResetToken t SET t.usedAt = CURRENT_TIMESTAMP "
            + "WHERE t.userId = :userId AND t.usedAt IS NULL")
    void invalidateUnusedForUser(@Param("userId") UUID userId);
}
