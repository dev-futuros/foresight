package com.foresight.backend.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data repository for {@link User}.
 *
 * <p>Only exposes the query methods the application actually needs — we deliberately keep
 * repositories narrow so callers cannot accidentally bypass business rules.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * @param externalUserId the stable user identifier from the external identity provider —
     *     the {@code sub} claim of the session JWT (Kinde)
     * @return the matching user, or empty if none exists
     */
    Optional<User> findByExternalUserId(String externalUserId);
}
