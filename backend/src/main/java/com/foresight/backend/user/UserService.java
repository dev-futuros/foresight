package com.foresight.backend.user;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.common.exception.NotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Business logic for reading and updating user profiles, plus the bridge between Clerk identities
 * and local {@link User} rows.
 *
 * <p>Authentication itself is delegated to Clerk. This service is responsible for:
 *
 * <ul>
 *   <li>Loading and updating local profile fields.
 *   <li>Lazy-creating a local row the first time a Clerk-authenticated user reaches the API
 *       (covers the webhook race window).
 *   <li>Reconciling the local row when the {@code user.created} / {@code user.updated} /
 *       {@code user.deleted} webhooks fire.
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private static final String DEFAULT_LANGUAGE = "es";

    private final UserRepository userRepository;

    /**
     * Loads a user by UUID or throws a 404-mapped exception.
     *
     * @param id the user's UUID
     * @return the matching {@link User}
     * @throws NotFoundException if no user exists with that id
     */
    public User getById(UUID id) {
        return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User not found"));
    }

    /**
     * Returns the local {@link User} row for the given Clerk identity, creating it on the fly if
     * the {@code user.created} webhook hasn't replicated it yet.
     *
     * <p>Called from {@link com.foresight.backend.common.security.JwtAuthFilter} on every
     * authenticated request, so it must be cheap on the hot path: a single indexed lookup, and an
     * insert only on the very first request after sign-up.
     *
     * @param clerkUserId stable Clerk identifier from the session JWT's {@code sub} claim
     * @param jwt the validated session JWT — used to seed email / name on first creation
     * @return the local user row
     */
    @Transactional
    public User findOrCreateByClerkUserId(String clerkUserId, Jwt jwt) {
        var existing = userRepository.findByClerkUserId(clerkUserId);
        if (existing.isPresent()) {
            return existing.get();
        }

        String email = jwt.getClaimAsString("email");
        String name = firstNonBlank(jwt.getClaimAsString("name"), jwt.getClaimAsString("first_name"));

        try {
            return userRepository.save(User.builder()
                    .clerkUserId(clerkUserId)
                    .email(email)
                    .name(name)
                    .role(UserRole.USER)
                    .language(DEFAULT_LANGUAGE)
                    .build());
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            return userRepository.findByClerkUserId(clerkUserId).orElseThrow(() -> e);
        }
    }

    /**
     * Idempotent upsert used by the Clerk webhook handler when a {@code user.created} or
     * {@code user.updated} event arrives.
     *
     * @param clerkUserId Clerk's identifier for the user
     * @param email primary email mirrored from Clerk (must not be null)
     * @param name optional display name
     * @return the persisted user row
     */
    @Transactional
    public void upsertFromClerk(String clerkUserId, String email, String name) {
        userRepository
                .findByClerkUserId(clerkUserId)
                .map(existing -> {
                    existing.setEmail(email);
                    if (name != null) existing.setName(name);
                    return userRepository.save(existing);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .clerkUserId(clerkUserId)
                        .email(email)
                        .name(name)
                        .role(UserRole.USER)
                        .language(DEFAULT_LANGUAGE)
                        .build()));
    }

    /**
     * Updates mutable profile fields. {@code null} arguments are ignored (partial update).
     *
     * @param id user to update
     * @param name new display name, or {@code null} to leave unchanged
     * @param language new preferred language, or {@code null} to leave unchanged
     * @return the updated (and persisted) user
     * @throws NotFoundException if no user exists with that id
     */
    public User updateProfile(UUID id, String name, String language) {
        User user = getById(id);
        if (name != null) user.setName(name);
        if (language != null) user.setLanguage(language);
        return userRepository.save(user);
    }

    /**
     * Permanently deletes the user and every resource they own.
     *
     * <p>Cascade policy — the {@code users} table is the root of the ownership graph, and every
     * child table (reports) declares {@code ON DELETE CASCADE} on its {@code user_id} FK. A single
     * {@code DELETE FROM users} is therefore enough to wipe the user's footprint. This implements
     * GDPR's right to erasure in its strictest form: hard delete, no anonymization shadow.
     *
     * <p>Triggered both by user-initiated deletion (via {@code DELETE /api/users/me}, which also
     * deletes the Clerk side via the management API) and by the {@code user.deleted} webhook
     * (when the user is deleted directly from the Clerk dashboard).
     *
     * @param id user to delete
     * @throws NotFoundException if no user exists with that id
     */
    @Transactional
    public void deleteAccount(UUID id) {
        User user = getById(id);
        userRepository.delete(user);
        log.info("Deleted user account id={} email={}", user.getId(), user.getEmail());
    }

    /**
     * Webhook-driven counterpart to {@link #deleteAccount(UUID)}: deletes by Clerk id and is a
     * no-op if the row no longer exists (Clerk may redeliver events).
     */
    @Transactional
    public void deleteByClerkUserId(String clerkUserId) {
        userRepository.findByClerkUserId(clerkUserId).ifPresent(user -> {
            userRepository.delete(user);
            log.info("Deleted user (via webhook) id={} clerkId={}", user.getId(), clerkUserId);
        });
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        if (b != null && !b.isBlank()) return b;
        return null;
    }
}
