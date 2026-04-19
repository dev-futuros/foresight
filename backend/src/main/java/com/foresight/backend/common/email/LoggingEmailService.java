package com.foresight.backend.common.email;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Stub {@link EmailService} that logs the would-be email instead of sending it.
 *
 * <p>Intended for local development, tests, and early staging. The token appears in the
 * backend logs so a developer / QA can grab it and paste it into the next endpoint. It is
 * NOT safe for production — swap for a real provider before exposing the app to real users.
 *
 * <p>When a real implementation is wired up, it should replace this bean (e.g. by being
 * conditionally loaded under a {@code @ConditionalOnProperty}) so production deployments
 * never fall back to logging tokens to stdout.
 */
@Slf4j
@Service
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
