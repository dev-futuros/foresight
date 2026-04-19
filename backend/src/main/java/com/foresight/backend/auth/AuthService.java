package com.foresight.backend.auth;

import java.util.UUID;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.auth.dto.AuthResponse;
import com.foresight.backend.auth.dto.ChangePasswordRequest;
import com.foresight.backend.auth.dto.LoginRequest;
import com.foresight.backend.auth.dto.RegisterRequest;
import com.foresight.backend.common.exception.ConflictException;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.common.security.JwtService;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;
import com.foresight.backend.user.UserRole;
import com.foresight.backend.user.dto.UserResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Business logic for user registration and login.
 *
 * <p>Produces {@link AuthResponse} objects (JWT + user projection) without exposing the
 * underlying {@link User} entity to controllers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailVerificationService emailVerificationService;

    /**
     * Creates a new user account.
     *
     * <p>Steps:
     * <ol>
     *   <li>Ensure the email is not already registered ({@link ConflictException} otherwise).</li>
     *   <li>Hash the plaintext password with BCrypt.</li>
     *   <li>Persist the user with role {@link UserRole#USER} and {@code emailVerified=false}.</li>
     *   <li>Issue a JWT and return the response.</li>
     * </ol>
     *
     * @param request validated registration input
     * @return the JWT + the newly-created user's projection
     * @throws ConflictException if the email is already in use
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered");
        }

        User user = User.builder()
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                .name(request.name())
                .role(UserRole.USER)
                .language(request.language() != null ? request.language() : "es")
                .emailVerified(false)
                .build();

        user = userRepository.save(user);
        // Fire-and-forget the verification email right after sign-up. Failures are logged by
        // the email service but never block registration.
        emailVerificationService.sendVerificationEmail(user);
        return buildResponse(user);
    }

    /**
     * Authenticates an existing user.
     *
     * <p>Both "user not found" and "wrong password" throw the same
     * {@link BadCredentialsException} to avoid leaking whether the email is registered.
     *
     * @param request validated login input
     * @return the JWT + the user's projection
     * @throws BadCredentialsException if the email or password is wrong
     */
    public AuthResponse login(LoginRequest request) {
        User user = userRepository
                .findByEmail(request.email())
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        return buildResponse(user);
    }

    /**
     * Changes the password of an already-authenticated user.
     *
     * <p>Requires the current password as proof of knowledge — a stolen JWT alone is not
     * enough to rotate credentials. On success the password hash is replaced and the user is
     * saved; the JWT the client holds keeps working until it expires naturally (see the
     * deferred logout/revocation work for immediate invalidation).
     *
     * @param userId  authenticated user id (from JWT)
     * @param request validated payload with current + new password
     * @throws NotFoundException       if no user with that id exists (should not happen)
     * @throws BadCredentialsException if the current password does not match
     */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User not found"));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        log.info("Password changed for user id={}", userId);
    }

    /**
     * Internal helper that signs a token and wraps the response payload.
     *
     * @param user authenticated / newly-created user
     * @return populated {@link AuthResponse}
     */
    private AuthResponse buildResponse(User user) {
        String token = jwtService.generateToken(
                user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, jwtService.getTtlSeconds(), UserResponse.from(user));
    }
}
