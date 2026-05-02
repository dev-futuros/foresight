package com.foresight.backend.common.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * SMTP-backed {@link EmailService} that actually delivers transactional emails.
 *
 * <p>Activated when {@code foresight.email.provider=smtp}. The underlying
 * {@link JavaMailSender} is auto-configured from {@code spring.mail.*} properties (host,
 * port, username, password, STARTTLS flags). To use Gmail, enable 2FA on the account and
 * generate an app password — Gmail no longer accepts the account password for SMTP.
 *
 * <p>Email failures are logged but never bubble up to the caller, matching the contract on
 * {@link EmailService}: a lost reset email is preferable to a 500 response.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "foresight.email.provider", havingValue = "smtp")
@RequiredArgsConstructor
public class SmtpEmailService implements EmailService {

    private final JavaMailSender mailSender;

    @Value("${foresight.email.from}")
    private String fromAddress;

    @Value("${foresight.email.from-name:Foresight}")
    private String fromName;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Override
    public void sendPasswordResetEmail(String toEmail, String rawToken) {
        String link = frontendUrl + "/reset-password?token=" + rawToken;
        String subject = "Restablecer tu contraseña — Foresight";
        String html =
                """
                <p>Hola,</p>
                <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Foresight.</p>
                <p><a href="%s">Pulsa aquí para crear una nueva contraseña</a> (el enlace expira en 30 minutos).</p>
                <p>Si no has sido tú, puedes ignorar este mensaje.</p>
                <p>— El equipo de Foresight</p>
                """
                        .formatted(link);
        send(toEmail, subject, html, "PasswordReset");
    }

    @Override
    public void sendEmailVerificationEmail(String toEmail, String rawToken) {
        String link = frontendUrl + "/verify-email?token=" + rawToken;
        String subject = "Verifica tu correo — Foresight";
        String html =
                """
                <p>¡Bienvenido a Foresight!</p>
                <p>Para activar tu cuenta, confirma tu dirección de correo:</p>
                <p><a href="%s">Verificar mi correo</a> (el enlace expira en 24 horas).</p>
                <p>Si no has creado esta cuenta, puedes ignorar este mensaje.</p>
                <p>— El equipo de Foresight</p>
                """
                        .formatted(link);
        send(toEmail, subject, html, "EmailVerification");
    }

    private void send(String toEmail, String subject, String htmlBody, String kind) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("[EMAIL SMTP] {} → to={} sent ok", kind, toEmail);
        } catch (MessagingException | java.io.UnsupportedEncodingException e) {
            log.error("[EMAIL SMTP] {} → to={} failed: {}", kind, toEmail, e.getMessage(), e);
        } catch (Exception e) {
            log.error("[EMAIL SMTP] {} → to={} unexpected failure: {}", kind, toEmail, e.getMessage(), e);
        }
    }
}
