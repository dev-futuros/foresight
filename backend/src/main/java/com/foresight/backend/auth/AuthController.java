package com.foresight.backend.auth;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.auth.dto.AuthResponse;
import com.foresight.backend.auth.dto.LoginRequest;
import com.foresight.backend.auth.dto.RegisterRequest;

import lombok.RequiredArgsConstructor;

/**
 * REST endpoints for account creation and login.
 *
 * <p>Both endpoints are whitelisted in
 * {@link com.foresight.backend.common.config.SecurityConfig} and do not require a token.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * Creates a new account.
     *
     * @param request validated registration payload
     * @return HTTP 201 with the issued JWT and user projection
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(authService.register(request));
    }

    /**
     * Authenticates an existing user and issues a JWT.
     *
     * @param request validated login payload
     * @return HTTP 200 with the issued JWT and user projection
     */
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }
}
