package com.foresight.backend.auth;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.auth.token.EmailVerificationToken;
import com.foresight.backend.auth.token.EmailVerificationTokenRepository;
import com.foresight.backend.auth.token.TokenHasher;
import com.foresight.backend.common.config.SecurityProperties;
import com.foresight.backend.common.email.EmailService;
import com.foresight.backend.common.exception.BadRequestException;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Implements email verification: issue a token on signup / resend, redeem it to flip the
 * {@code email_verified} flag on the user row.
 *
 * <p>Mirrors the security model of {@link PasswordResetService} — only hashed tokens are
 * stored, tokens are single-use, and reissuing invalidates previous ones.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    private final UserRepository userRepository;
    private final EmailVerificationTokenRepository tokenRepository;
    private final EmailService emailService;
    private final SecurityProperties securityProperties;

    /**
     * Issues a fresh verification token for the given user and dispatches the email.
     *
     * <p>Idempotent: if the user is already verified, the call is a no-op so resend buttons
     * are safe to click repeatedly.
     *
     * @param user user to send a verification link to
     */
    @Transactional
    public void sendVerificationEmail(User user) {
        if (user.isEmailVerified()) {
            return;
        }

        tokenRepository.invalidateUnusedForUser(user.getId());

        String rawToken = TokenHasher.newRawToken();
        EmailVerificationToken token = EmailVerificationToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plus(securityProperties.emailVerificationTokenTtl()))
                .build();
        tokenRepository.save(token);

        emailService.sendEmailVerificationEmail(user.getEmail(), rawToken);
        log.info("Email verification token issued for user id={}", user.getId());
    }

    /**
     * Resends the verification email for the authenticated user (looked up by id).
     *
     * @param userId authenticated user id
     * @throws NotFoundException if the user no longer exists
     */
    @Transactional
    public void resendForUser(UUID userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User not found"));
        sendVerificationEmail(user);
    }

    /**
     * Redeems a verification token, flipping {@code email_verified} to {@code true}.
     *
     * @param rawToken the token the user received by email
     * @throws BadRequestException if the token is unknown, already used, or expired
     */
    @Transactional
    public void verify(String rawToken) {
        String hash = TokenHasher.hash(rawToken);
        EmailVerificationToken token = tokenRepository
                .findByTokenHash(hash)
                .orElseThrow(() -> new BadRequestException("Invalid or expired token"));

        if (token.getUsedAt() != null || token.getExpiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Invalid or expired token");
        }

        User user = userRepository
                .findById(token.getUserId())
                .orElseThrow(() -> new BadRequestException("Invalid or expired token"));

        user.setEmailVerified(true);
        userRepository.save(user);

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);

        log.info("Email verified for user id={}", user.getId());
    }
}
