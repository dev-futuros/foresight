package com.foresight.backend.user;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.common.security.DevPrincipal;
import com.foresight.backend.common.security.KindeBackendClient;
import com.foresight.backend.user.dto.UserResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Business logic for the authenticated user's profile, plus the bridge between Kinde users and
 * local {@link User} rows.
 *
 * <p>Kinde is the source of truth for the profile data the user actually sees and edits:
 * {@code name} (Kinde stock {@code first_name}/{@code last_name}), {@code email} (Kinde stock
 * {@code preferred_email}), {@code picture} (Kinde stock), and {@code language} (Kinde Property,
 * defined in Kinde Dashboard → Settings → Properties). The local {@code users} row is kept
 * intentionally thin:
 *
 * <ul>
 *   <li>{@code id} — foreign-key target for every owned resource (reports, etc.).</li>
 *   <li>{@code externalUserId} — Kinde id, the join key on the way out.</li>
 *   <li>{@code role} — authorization concern, checked on every request, too hot to fetch
 *       from Kinde each time.</li>
 *   <li>{@code createdAt} / {@code updatedAt} — local audit timestamps.</li>
 * </ul>
 *
 * <p>This service is responsible for:
 *
 * <ul>
 *   <li>Composing the public {@link UserResponse} by joining the local row with Kinde's stock
 *       fields and Property values (see {@link #getProfile}).</li>
 *   <li>Pushing profile edits through to Kinde — name to stock, language to Property — without
 *       touching the local row, so Kinde stays the only place that ever changes (see
 *       {@link #updateProfile}).</li>
 *   <li>Lazy-creating a local row the first time a Kinde-authenticated user reaches the API
 *       (covers the webhook race window).</li>
 *   <li>Reconciling the local row when the {@code user.created} / {@code user.deleted}
 *       webhooks fire. {@code user.updated} is a no-op for us now — Kinde owns the data.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    /**
     * Kinde Property key for the user's preferred UI language. Must be created in
     * Kinde Dashboard → Settings → Properties before this app can write to it (Kinde
     * rejects PATCH for undefined keys). See {@code docs/MIGRATION_CLERK_TO_KINDE.md}
     * for the one-time setup instructions.
     */
    static final String LANGUAGE_PROPERTY_KEY = "language";

    /**
     * Fallback language returned when (a) the user hasn't picked one yet, so the Kinde Property
     * is missing, or (b) Kinde is unreachable, or (c) the principal is the synthetic dev user
     * which has no Kinde counterpart.
     */
    static final String DEFAULT_LANGUAGE = "es";

    /** Placeholder email shown for the dev user; never reaches a real inbox. */
    private static final String DEV_EMAIL = "dev@local";

    private final UserRepository userRepository;
    private final KindeBackendClient kindeBackendClient;

    /**
     * Per-external-id locks used to serialize the very first lazy creation when several
     * requests from the same fresh user arrive concurrently (e.g. the dashboard fires
     * {@code /users/me} and {@code /reports} in parallel right after sign-in).
     *
     * <p>Without this, both threads see "user not found", both try to INSERT, one fails with
     * a unique-constraint violation. The DB catches it correctly thanks to {@code
     * uk_users_external_user_id}, but the failing INSERT still produces noisy stack traces
     * and a wasted round-trip. Holding a JVM-level lock for the few milliseconds it takes to
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
     * Returns the local {@link User} row for the given Kinde user id, creating it on the fly if
     * the {@code user.created} webhook hasn't replicated it yet.
     *
     * <p>Called from {@link com.foresight.backend.common.security.JwtAuthFilter} on every
     * authenticated request, so it must be cheap on the hot path: a single indexed lookup, and an
     * insert only on the very first request after sign-up. We deliberately do NOT call Kinde from
     * here — profile data is composed lazily by {@link #getProfile} when the frontend asks for it.
     *
     * <p>Intentionally NOT {@code @Transactional} at this level: each {@code repository.save()}
     * call uses its own implicit transaction, which means a failed INSERT (constraint violation
     * from a parallel insert in another JVM) does not poison the caller's transaction. After the
     * failed save we can simply re-issue {@link UserRepository#findByExternalUserId(String)} and
     * find the row written by the winner.
     */
    public User findOrCreateByExternalUserId(String externalUserId) {
        var existing = userRepository.findByExternalUserId(externalUserId);
        if (existing.isPresent()) {
            return existing.get();
        }

        Object lock = creationLocks.computeIfAbsent(externalUserId, k -> new Object());
        try {
            synchronized (lock) {
                var afterLock = userRepository.findByExternalUserId(externalUserId);
                if (afterLock.isPresent()) {
                    return afterLock.get();
                }
                try {
                    return userRepository.save(User.builder()
                            .externalUserId(externalUserId)
                            .role(UserRole.USER)
                            .build());
                } catch (DataIntegrityViolationException e) {
                    return userRepository.findByExternalUserId(externalUserId).orElseThrow(() -> e);
                }
            }
        } finally {
            creationLocks.remove(externalUserId);
        }
    }

    /**
     * Composes the public profile for the given user by joining the local row with Kinde stock
     * fields ({@code first_name}, {@code last_name}, {@code preferred_email}, {@code picture})
     * and the {@code language} Kinde Property.
     *
     * <p>Two Kinde Management API calls per invocation (one for the user, one for the
     * properties) — ~300ms added latency on a cold {@code /me} hit. Cheap enough for a
     * profile read that the SPA caches via TanStack Query and only fetches once per session;
     * if the modal becomes used heavier (or we move {@code subscription_plan} to Properties
     * and check it on every API call), we'll add a short-TTL per-user cache here.
     *
     * <p>Short-circuits to a hardcoded synthetic profile for the dev user
     * ({@link DevPrincipal#EXTERNAL_USER_ID}) — that id has no Kinde counterpart, so the
     * Management API calls would 404. Lets the local dev workflow keep working without a
     * real Kinde tenant.
     */
    public UserResponse getProfile(UUID userId) {
        User user = getById(userId);
        if (DevPrincipal.EXTERNAL_USER_ID.equals(user.getExternalUserId())) {
            return new UserResponse(
                    user.getId(), DevPrincipal.NAME, DEV_EMAIL, null, user.getRole(), DEFAULT_LANGUAGE);
        }
        Optional<KindeBackendClient.KindeUser> kindeUser =
                kindeBackendClient.fetchUser(user.getExternalUserId());
        Map<String, String> properties = kindeBackendClient.fetchUserProperties(user.getExternalUserId());
        return new UserResponse(
                user.getId(),
                kindeUser.map(KindeBackendClient.KindeUser::composedName).orElse(null),
                kindeUser.map(KindeBackendClient.KindeUser::preferredEmail).orElse(null),
                kindeUser.map(KindeBackendClient.KindeUser::picture).orElse(null),
                user.getRole(),
                properties.getOrDefault(LANGUAGE_PROPERTY_KEY, DEFAULT_LANGUAGE));
    }

    /**
     * Pushes profile changes through to Kinde — {@code name} to the stock {@code first_name} /
     * {@code last_name} fields, {@code language} to the {@code language} Kinde Property — and
     * returns the freshly composed profile.
     *
     * <p>{@code null} arguments mean "leave this field unchanged" (partial update semantics).
     * Both fields are pushed in a best-effort independent fashion: if {@code name} succeeds
     * and {@code language} fails, the name change still stands. Failures propagate as runtime
     * exceptions so the SPA surfaces them to the user — swallowing them would let the next
     * webhook delivery overwrite the intended change with the stale value.
     *
     * <p>Skips Kinde entirely when the principal is the synthetic dev user: that id has no
     * Kinde counterpart, and the call would 404. The dev profile is effectively read-only
     * (the synthetic name/language returned by {@link #getProfile} stays fixed) — local dev
     * doesn't need persistent profile edits.
     */
    public UserResponse updateProfile(UUID id, String name, String language) {
        User user = getById(id);
        if (!DevPrincipal.EXTERNAL_USER_ID.equals(user.getExternalUserId())) {
            if (name != null) {
                kindeBackendClient.updateUser(user.getExternalUserId(), name);
            }
            if (language != null) {
                kindeBackendClient.updateUserProperties(
                        user.getExternalUserId(), Map.of(LANGUAGE_PROPERTY_KEY, language));
            }
        }
        // Re-fetch to reflect the just-written values. The extra round-trip pair (~300ms)
        // is acceptable on save — the user is waiting on a click, not a hot path.
        return getProfile(id);
    }

    /**
     * Idempotent insert used by the Kinde webhook handler when a {@code user.created} event
     * arrives. We only persist the {@code externalUserId} + role + timestamps; profile fields
     * (name, language) live in Kinde and are fetched lazily by {@link #getProfile}.
     *
     * <p>The matching {@code user.updated} event is a no-op now — there's nothing local to
     * update, since profile data is owned by Kinde. Kept here for parity with the webhook
     * dispatch table without doing anything destructive on redelivery.
     */
    @Transactional
    public void upsertFromExternal(String externalUserId) {
        userRepository
                .findByExternalUserId(externalUserId)
                .orElseGet(() -> userRepository.save(User.builder()
                        .externalUserId(externalUserId)
                        .role(UserRole.USER)
                        .build()));
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
        log.info("Deleted user account id={} externalId={}", user.getId(), user.getExternalUserId());
    }

    /**
     * Webhook-driven counterpart to {@link #deleteAccount(UUID)}: deletes by external-provider id
     * and is a no-op if the row no longer exists (the provider may redeliver events).
     */
    @Transactional
    public void deleteByExternalUserId(String externalUserId) {
        userRepository.findByExternalUserId(externalUserId).ifPresent(user -> {
            userRepository.delete(user);
            log.info("Deleted user (via webhook) id={} externalId={}", user.getId(), externalUserId);
        });
    }
}
