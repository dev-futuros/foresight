package com.foresight.backend.user;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;
import com.foresight.backend.user.dto.UpdateUserRequest;
import com.foresight.backend.user.dto.UserResponse;

import lombok.RequiredArgsConstructor;

/**
 * REST endpoints for the authenticated user's own profile.
 *
 * <p>Routes under {@code /api/users/me} always act on the caller — there is no way to read or
 * modify another user from here. Admin endpoints, when they exist, will live in a separate
 * controller with their own security rules.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * Returns the caller's profile.
     *
     * @param principal automatically resolved from the JWT
     * @return a {@link UserResponse} projection of the current user
     */
    @GetMapping("/me")
    public UserResponse me(@CurrentUser AuthenticatedUser principal) {
        return UserResponse.from(userService.getById(principal.id()));
    }

    /**
     * Partially updates the caller's profile. Only {@code name} and {@code language} can be
     * changed from here; credentials and role changes go through dedicated flows.
     *
     * @param principal authenticated caller
     * @param request   validated partial update
     * @return the updated profile projection
     */
    @PatchMapping("/me")
    public UserResponse updateMe(
            @CurrentUser AuthenticatedUser principal, @Valid @RequestBody UpdateUserRequest request) {
        return UserResponse.from(userService.updateProfile(principal.id(), request.name(), request.language()));
    }
}
