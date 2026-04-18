package com.foresight.backend.user;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.foresight.backend.common.exception.NotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Business logic for reading and updating user profiles.
 *
 * <p>Authentication and credential changes live in
 * {@link com.foresight.backend.auth.AuthService}; this service is intentionally focused on
 * profile data so responsibilities stay clear.
 */
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
}
