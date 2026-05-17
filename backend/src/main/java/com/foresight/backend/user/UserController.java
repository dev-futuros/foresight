package com.foresight.backend.user;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
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
     * Returns the caller's composed profile — local row joined with Kinde stock fields and
     * Properties. See {@link UserService#getProfile(java.util.UUID)} for the composition.
     *
     * @param principal automatically resolved from the JWT
     * @return a {@link UserResponse} projection of the current user
     */
    @GetMapping("/me")
    public UserResponse me(@CurrentUser AuthenticatedUser principal) {
        return userService.getProfile(principal.id());
    }

    /**
     * Partially updates the caller's profile. {@code name} is pushed to Kinde stock
     * ({@code first_name}/{@code last_name}); {@code language} is pushed to the Kinde Property
     * {@code language}. Local row is not touched — Kinde owns the data. Credentials, email,
     * and role changes still go through their own dedicated flows (Kinde-hosted in the case
     * of credentials/email).
     *
     * @param principal authenticated caller
     * @param request   validated partial update
     * @return the updated profile projection (re-fetched after the Kinde write)
     */
    @PatchMapping("/me")
    public UserResponse updateMe(
            @CurrentUser AuthenticatedUser principal, @Valid @RequestBody UpdateUserRequest request) {
        return userService.updateProfile(principal.id(), request.name(), request.language());
    }

    /**
     * Permanently deletes the caller's account and every resource they own (reports, pending
     * auth tokens, etc.). This is irreversible and implements GDPR's right to erasure.
     *
     * <p>The JWT the client used to call this endpoint is NOT invalidated server-side — we
     * remain stateless. In practice its {@code sub} will no longer resolve to a user on the
     * next request, so every subsequent call fails with 401 / 404 and the client should drop
     * the token locally.
     *
     * @param principal authenticated caller
     * @return HTTP 204 on success
     */
    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMe(@CurrentUser AuthenticatedUser principal) {
        userService.deleteAccount(principal.id());
        return ResponseEntity.noContent().build();
    }
}
