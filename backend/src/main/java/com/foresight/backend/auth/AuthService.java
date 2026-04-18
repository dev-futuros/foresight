package com.foresight.backend.auth;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.auth.dto.AuthResponse;
import com.foresight.backend.auth.dto.LoginRequest;
import com.foresight.backend.auth.dto.RegisterRequest;
import com.foresight.backend.common.exception.ConflictException;
import com.foresight.backend.common.security.JwtService;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;
import com.foresight.backend.user.UserRole;
import com.foresight.backend.user.dto.UserResponse;

import lombok.RequiredArgsConstructor;

/**
 * Business logic for user registration and login.
 *
 * <p>Produces {@link AuthResponse} objects (JWT + user projection) without exposing the
 * underlying {@link User} entity to controllers.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

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
