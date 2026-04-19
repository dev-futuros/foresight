package com.foresight.backend.auth;

import java.time.Instant;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.auth.dto.ForgotPasswordRequest;
import com.foresight.backend.auth.dto.ResetPasswordRequest;
import com.foresight.backend.auth.token.PasswordResetToken;
import com.foresight.backend.auth.token.PasswordResetTokenRepository;
import com.foresight.backend.auth.token.TokenHasher;
import com.foresight.backend.common.config.SecurityProperties;
import com.foresight.backend.common.email.EmailService;
import com.foresight.backend.common.exception.BadRequestException;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Implements the "forgot password" flow: issuing single-use reset tokens via email and
 * redeeming them to rotate the password hash.
 *
 * <p>Security properties:
 * <ul>
 *   <li><b>No enumeration</b>: {@link #initiatePasswordReset(ForgotPasswordRequest)} always
 *       returns silently, so an attacker cannot use it to probe which emails are registered.</li>
 *   <li><b>Storage-side hash</b>: only {@code sha256(token)} is stored, never the raw token.
 *       A DB leak does not expose valid links.</li>
 *   <li><b>Single live token</b>: issuing a new reset invalidates previous unused ones for
 *       the same user.</li>
 *   <li><b>Short TTL</b>: defaults to 30 minutes (see {@link SecurityProperties}).</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final SecurityProperties securityProperties;

    /**
     * Starts the password-reset flow.
     *
     * <p>Always returns silently — the caller cannot tell whether the email exists or not.
     * When the email does match a user, a fresh token is issued, previous ones are
     * invalidated, and the email stub dispatches the reset link.
     *
     * @param request validated request containing the user's email
     */
    @Transactional
    public void initiatePasswordReset(ForgotPasswordRequest request) {
        Optional<User> maybeUser = userRepository.findByEmail(request.email());
        if (maybeUser.isEmpty()) {
            // Deliberately no exception: keep the response indistinguishable from the happy path.
            log.debug("Password reset requested for unknown email (silently ignored)");
            return;
        }

        User user = maybeUser.get();
        tokenRepository.invalidateUnusedForUser(user.getId());

        String rawToken = TokenHasher.newRawToken();
        PasswordResetToken token = PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plus(securityProperties.passwordResetTokenTtl()))
                .build();
        tokenRepository.save(token);

        emailService.sendPasswordResetEmail(user.getEmail(), rawToken);
        log.info("Password reset token issued for user id={}", user.getId());
    }

    /**
     * Completes the password-reset flow.
     *
     * <p>The token is validated (exists, not used, not expired), the password hash is
     * replaced, and the token is marked used so it cannot be replayed.
     *
     * @param request validated request with raw token + new password
     * @throws BadRequestException if the token is missing, unknown, already used, or expired
     */
    @Transactional
    public void completePasswordReset(ResetPasswordRequest request) {
        String hash = TokenHasher.hash(request.token());
        PasswordResetToken token = tokenRepository
                .findByTokenHash(hash)
                .orElseThrow(() -> new BadRequestException("Invalid or expired token"));

        if (token.getUsedAt() != null || token.getExpiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Invalid or expired token");
        }

        User user = userRepository
                .findById(token.getUserId())
                .orElseThrow(() -> new BadRequestException("Invalid or expired token"));

        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);

        log.info("Password reset completed for user id={}", user.getId());
    }
}
