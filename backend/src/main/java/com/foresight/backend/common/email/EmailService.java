package com.foresight.backend.common.email;

/**
 * Abstraction over outbound transactional emails (password reset, email verification).
 *
 * <p>Separating the contract from any concrete provider lets us swap the implementation
 * without touching callers. The initial implementation ({@link LoggingEmailService}) simply
 * logs the email — enough for local / CI development and for QA to grab the link from the
 * backend logs. A real provider (Resend, AWS SES, SendGrid, Postmark, …) should be swapped
 * in behind this interface when the time comes, ideally via a Spring profile or a
 * {@code foresight.email.provider} property.
 *
 * <p>All implementations MUST be non-blocking relative to the caller: email failures
 * should be logged, not bubble up to the HTTP request. Losing a reset email is preferable
 * to a 500 response that looks like the reset didn't happen.
 */
public interface EmailService {

    /**
     * Sends a password-reset email containing the raw token (usually embedded in a URL).
     *
     * @param toEmail  destination email address
     * @param rawToken opaque reset token to place in the email link
     */
    void sendPasswordResetEmail(String toEmail, String rawToken);

    /**
     * Sends an email-verification email containing the raw token.
     *
     * @param toEmail  destination email address
     * @param rawToken opaque verification token to place in the email link
     */
    void sendEmailVerificationEmail(String toEmail, String rawToken);
}
