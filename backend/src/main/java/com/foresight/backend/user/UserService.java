package com.foresight.backend.user;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.common.exception.NotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Business logic for reading and updating user profiles.
 *
 * <p>Authentication and credential changes live in
 * {@link com.foresight.backend.auth.AuthService}; this service is intentionally focused on
 * profile data so responsibilities stay clear.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

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
     * Updates mutable profile fields. {@code null} arguments are ignored (partial update).
     *
     * @param id       user to update
     * @param name     new display name, or {@code null} to leave unchanged
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
     * child table (reports, password_reset_tokens, email_verification_tokens) declares
     * {@code ON DELETE CASCADE} on its {@code user_id} FK. A single {@code DELETE FROM users}
     * is therefore enough to wipe the user's footprint. This implements GDPR's right to erasure
     * in its strictest form: hard delete, no anonymization shadow.
     *
     * <p>If business requirements later demand an anonymization step instead (e.g. keeping
     * aggregate analytics intact), the cascade can be swapped for a soft-delete flag and a
     * manual scrub job without changing the HTTP contract.
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
}
