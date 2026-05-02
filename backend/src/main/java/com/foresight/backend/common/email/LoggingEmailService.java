package com.foresight.backend.common.email;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Stub {@link EmailService} that logs the would-be email instead of sending it.
 *
 * <p>Intended for local development, tests, and early staging. Active by default — when
 * {@code foresight.email.provider} is unset or set to {@code logging}. The token appears in
 * the backend logs so a developer / QA can grab it and paste it into the next endpoint. It
 * is NOT safe for production: in real environments set {@code foresight.email.provider=smtp}
 * to swap for {@link SmtpEmailService}.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "foresight.email.provider", havingValue = "logging", matchIfMissing = true)
public class LoggingEmailService implements EmailService {

    @Override
    public void sendPasswordResetEmail(String toEmail, String rawToken) {
        log.info(
                "[EMAIL STUB] PasswordReset → to={} token={} " + "(POST /api/auth/reset-password with this token)",
                toEmail,
                rawToken);
    }

    @Override
    public void sendEmailVerificationEmail(String toEmail, String rawToken) {
        log.info(
                "[EMAIL STUB] EmailVerification → to={} token={} " + "(POST /api/auth/verify-email with this token)",
                toEmail,
                rawToken);
    }
}
