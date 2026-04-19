package com.foresight.backend.auth;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.auth.dto.AuthResponse;
import com.foresight.backend.auth.dto.ChangePasswordRequest;
import com.foresight.backend.auth.dto.ForgotPasswordRequest;
import com.foresight.backend.auth.dto.LoginRequest;
import com.foresight.backend.auth.dto.RegisterRequest;
import com.foresight.backend.auth.dto.ResetPasswordRequest;
import com.foresight.backend.auth.dto.VerifyEmailRequest;
import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;

/**
 * REST endpoints for account creation, login, and credential-management flows
 * (change password, forgot/reset password, email verification).
 *
 * <p>Public endpoints (no JWT): register, login, forgot-password, reset-password,
 * verify-email. These are whitelisted in
 * {@link com.foresight.backend.common.config.SecurityConfig}.
 *
 * <p>Authenticated endpoints (require a valid JWT): change-password,
 * resend-verification-email.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final EmailVerificationService emailVerificationService;

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

    /**
     * Rotates the password of an already-logged-in user. Requires the current password as
     * proof of knowledge so a stolen JWT alone is not enough to change credentials.
     *
     * @param principal authenticated caller
     * @param request   validated payload
     * @return HTTP 204 on success
     */
    @Operation(summary = "Change password (authenticated)")
    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            @CurrentUser AuthenticatedUser principal, @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(principal.id(), request);
        return ResponseEntity.noContent().build();
    }

    /**
     * Starts the password-reset flow. Always returns 204 even if the email is unknown, so
     * this endpoint cannot be used to enumerate registered accounts.
     *
     * @param request validated payload containing the user's email
     * @return HTTP 204
     */
    @Operation(
            summary = "Request a password-reset email",
            description = "Returns 204 whether or not the email is registered, to avoid account enumeration.")
    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.initiatePasswordReset(request);
        return ResponseEntity.noContent().build();
    }

    /**
     * Completes the password-reset flow: consumes the token and replaces the password hash.
     *
     * @param request validated payload with raw token + new password
     * @return HTTP 204 on success
     */
    @Operation(summary = "Reset password using a token from email")
    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.completePasswordReset(request);
        return ResponseEntity.noContent().build();
    }

    /**
     * Redeems an email-verification token, flipping {@code emailVerified} to {@code true}.
     *
     * @param request validated payload with the token
     * @return HTTP 204 on success
     */
    @Operation(summary = "Verify email using a token from email")
    @PostMapping("/verify-email")
    public ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerificationService.verify(request.token());
        return ResponseEntity.noContent().build();
    }

    /**
     * Sends the authenticated user a fresh verification email (useful if the original one
     * expired or was lost). No-op if the user is already verified.
     *
     * @param principal authenticated caller
     * @return HTTP 204
     */
    @Operation(summary = "Resend the email-verification email (authenticated)")
    @PostMapping("/resend-verification-email")
    public ResponseEntity<Void> resendVerificationEmail(@CurrentUser AuthenticatedUser principal) {
        emailVerificationService.resendForUser(principal.id());
        return ResponseEntity.noContent().build();
    }
}
