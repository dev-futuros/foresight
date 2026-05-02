package com.foresight.backend.user;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.common.security.ClerkBackendClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Business logic for reading and updating user profiles, plus the bridge between Clerk identities
 * and local {@link User} rows.
 *
 * <p>Authentication and email itself are delegated to Clerk. This service is responsible for:
 *
 * <ul>
 *   <li>Loading and updating local profile fields (name, language).
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
    private final ClerkBackendClient clerkBackendClient;

    /**
     * Per-clerk-id locks used to serialize the very first lazy creation when several requests
     * from the same fresh user arrive concurrently (e.g. the dashboard fires {@code /users/me}
     * and {@code /reports} in parallel right after sign-in).
     *
     * <p>Without this, both threads see "user not found", both try to INSERT, one fails with
     * a unique-constraint violation. The DB catches it correctly thanks to {@code
     * uk_users_clerk_user_id}, but the failing INSERT still produces noisy stack traces and
     * a wasted round-trip. Holding a JVM-level lock for the few milliseconds it takes to
     * resolve the first request keeps the second request cheap (single SELECT).
     *
     * <p>JVM-level only: in a multi-instance deployment the DB unique constraint remains the
     * authoritative guard, and the {@code DataIntegrityViolationException} catch below recovers
     * the row written by the other instance. Entries are removed after creation completes so
     * the map cannot grow unbounded.
     */
    private final ConcurrentMap<String, Object> creationLocks = new ConcurrentHashMap<>();

    /**
     * Loads a user by UUID or throws a 404-mapped exception.
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
     * <p>Intentionally NOT {@code @Transactional} at this level: each {@code repository.save()}
     * call uses its own implicit transaction, which means a failed INSERT (constraint violation
     * from a parallel insert in another JVM) does not poison the caller's transaction. After the
     * failed save we can simply re-issue {@link UserRepository#findByClerkUserId(String)} and
     * find the row written by the winner.
     */
    public User findOrCreateByClerkUserId(String clerkUserId, Jwt jwt) {
        var existing = userRepository.findByClerkUserId(clerkUserId);
        if (existing.isPresent()) {
            return healMissingName(existing.get(), clerkUserId);
        }

        Object lock = creationLocks.computeIfAbsent(clerkUserId, k -> new Object());
        try {
            synchronized (lock) {
                var afterLock = userRepository.findByClerkUserId(clerkUserId);
                if (afterLock.isPresent()) {
                    return healMissingName(afterLock.get(), clerkUserId);
                }
                try {
                    return userRepository.save(User.builder()
                            .clerkUserId(clerkUserId)
                            .name(resolveName(clerkUserId, jwt))
                            .role(UserRole.USER)
                            .language(DEFAULT_LANGUAGE)
                            .build());
                } catch (DataIntegrityViolationException e) {
                    return userRepository.findByClerkUserId(clerkUserId).orElseThrow(() -> e);
                }
            }
        } finally {
            creationLocks.remove(clerkUserId);
        }
    }

    /**
     * Resolves the user's display name on first sign-in.
     *
     * <p>Strategy: prefer Clerk's Backend API (authoritative, always returns the live profile),
     * fall back to JWT claims (only present if a JWT template is configured), and finally accept
     * {@code null} — the user can always edit their name from the account page, and a future
     * webhook delivery will fill it in retroactively.
     */
    private String resolveName(String clerkUserId, Jwt jwt) {
        return clerkBackendClient.fetchUser(clerkUserId)
                .map(ClerkBackendClient.ClerkUser::composedName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> firstNonBlank(
                        jwt.getClaimAsString("name"),
                        jwt.getClaimAsString("first_name")));
    }

    /**
     * Backfills {@code name} for an existing user whose row was created before Clerk's profile
     * was queryable (e.g. when {@code CLERK_SECRET_KEY} hadn't been configured yet, or before
     * this codepath existed). Runs at most once per user — once {@code name} is set, the guard
     * short-circuits on every subsequent request.
     */
    private User healMissingName(User user, String clerkUserId) {
        if (user.getName() != null && !user.getName().isBlank()) {
            return user;
        }
        return clerkBackendClient.fetchUser(clerkUserId)
                .map(ClerkBackendClient.ClerkUser::composedName)
                .filter(n -> n != null && !n.isBlank())
                .map(name -> {
                    user.setName(name);
                    log.info("Backfilled name for user id={} clerkId={}", user.getId(), clerkUserId);
                    return userRepository.save(user);
                })
                .orElse(user);
    }

    /**
     * Idempotent upsert used by the Clerk webhook handler when a {@code user.created} or
     * {@code user.updated} event arrives.
     */
    @Transactional
    public void upsertFromClerk(String clerkUserId, String name) {
        userRepository
                .findByClerkUserId(clerkUserId)
                .map(existing -> {
                    if (name != null) existing.setName(name);
                    return userRepository.save(existing);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .clerkUserId(clerkUserId)
                        .name(name)
                        .role(UserRole.USER)
                        .language(DEFAULT_LANGUAGE)
                        .build()));
    }

    /**
     * Updates mutable profile fields. {@code null} arguments are ignored (partial update).
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
     * {@code DELETE FROM users} is therefore enough to wipe the user's footprint.
     */
    @Transactional
    public void deleteAccount(UUID id) {
        User user = getById(id);
        userRepository.delete(user);
        log.info("Deleted user account id={} clerkId={}", user.getId(), user.getClerkUserId());
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
