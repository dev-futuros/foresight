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
     * @param clerkUserId Clerk's stable user identifier (the {@code sub} claim of the session JWT)
     * @return the matching user, or empty if none exists
     */
    Optional<User> findByClerkUserId(String clerkUserId);

    /**
     * @param email the email to look up (case-sensitive, as the column is stored verbatim)
     * @return the matching user, or empty if none exists
     */
    Optional<User> findByEmail(String email);
}
