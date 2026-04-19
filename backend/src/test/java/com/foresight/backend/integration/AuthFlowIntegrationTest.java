package com.foresight.backend.integration;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * End-to-end coverage of the {@code /api/auth/**} surface: register, login, change-password,
 * forgot/reset, email verification.
 */
class AuthFlowIntegrationTest extends AbstractIntegrationTest {

    @Test
    void registerIssuesJwtAndPersistsUser() throws Exception {
        String email = "first-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> body =
                Map.of("email", email, "password", "OriginalPass!1", "name", "Alice", "language", "en");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken", notNullValue()))
                .andExpect(jsonPath("$.expiresIn").value(is(3600)))
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.emailVerified").value(false))
                .andExpect(jsonPath("$.user.role").value("USER"));
    }

    @Test
    void registerRejectsDuplicateEmailWith409() throws Exception {
        RegisteredUser existing = registerRandomUser();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", existing.email(),
                                "password", "AnotherPass!1",
                                "name", "Dup",
                                "language", "en"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Email already registered"));
    }

    @Test
    void loginReturnsJwtForValidCredentials() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "OriginalPass!1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken", notNullValue()))
                .andExpect(jsonPath("$.user.id").value(user.id().toString()));
    }

    @Test
    void loginRejectsWrongPasswordWith401() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "wrong-password"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginRejectsUnknownEmailWith401() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", "ghost-" + UUID.randomUUID() + "@example.com", "password", "any"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void changePasswordRotatesCredentials() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("currentPassword", "OriginalPass!1", "newPassword", "BrandNewPass!2"))))
                .andExpect(status().isNoContent());

        // Old password no longer works.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "OriginalPass!1"))))
                .andExpect(status().isUnauthorized());

        // New password does.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "BrandNewPass!2"))))
                .andExpect(status().isOk());
    }

    @Test
    void changePasswordRejectsWrongCurrentPasswordWith401() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("currentPassword", "wrong", "newPassword", "BrandNewPass!2"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void changePasswordRequiresAuthentication() throws Exception {
        // Spring Security's default AccessDeniedHandler returns 403 for requests with no
        // credentials at all (vs 401 which GlobalExceptionHandler maps from AuthService errors).
        mockMvc.perform(post("/api/auth/change-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("currentPassword", "x", "newPassword", "BrandNewPass!2"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void forgotPasswordAndResetRoundTrip() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        // Kick off the reset — captured by RecordingEmailService.
        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", user.email()))))
                .andExpect(status().isNoContent());

        String rawToken = recordingEmailService.lastPasswordResetToken(user.email());
        org.assertj.core.api.Assertions.assertThat(rawToken).isNotBlank();

        // Redeem it.
        mockMvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("token", rawToken, "newPassword", "AfterResetPass!3"))))
                .andExpect(status().isNoContent());

        // Login works with the new password, fails with the old.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "AfterResetPass!3"))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", user.email(), "password", "OriginalPass!1"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void forgotPasswordIsSilentForUnknownEmail() throws Exception {
        // No enumeration: 204 even if the email isn't registered. No token gets captured.
        String ghost = "ghost-" + UUID.randomUUID() + "@example.com";

        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", ghost))))
                .andExpect(status().isNoContent());

        org.assertj.core.api.Assertions.assertThat(recordingEmailService.lastPasswordResetToken(ghost))
                .isNull();
    }

    @Test
    void resetPasswordRejectsInvalidTokenWith400() throws Exception {
        mockMvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("token", "not-a-real-token", "newPassword", "Whatever!1"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordCannotBeReplayed() throws Exception {
        RegisteredUser user = registerRandomUser("OriginalPass!1");

        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", user.email()))))
                .andExpect(status().isNoContent());

        String rawToken = recordingEmailService.lastPasswordResetToken(user.email());

        mockMvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("token", rawToken, "newPassword", "FirstUse!3"))))
                .andExpect(status().isNoContent());

        // Same token second time → 400 (used).
        mockMvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("token", rawToken, "newPassword", "SecondUse!4"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void emailVerificationFlipsFlagOnceRedeemed() throws Exception {
        RegisteredUser user = registerRandomUser();

        // Registration dispatched a verification email automatically.
        String rawToken = recordingEmailService.lastEmailVerificationToken(user.email());
        org.assertj.core.api.Assertions.assertThat(rawToken).isNotBlank();

        mockMvc.perform(post("/api/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("token", rawToken))))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/users/me").header("Authorization", user.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emailVerified").value(true));
    }

    @Test
    void verifyEmailRejectsInvalidTokenWith400() throws Exception {
        mockMvc.perform(post("/api/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("token", "not-real"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resendVerificationEmailIssuesFreshToken() throws Exception {
        RegisteredUser user = registerRandomUser();
        String initial = recordingEmailService.lastEmailVerificationToken(user.email());

        mockMvc.perform(post("/api/auth/resend-verification-email").header("Authorization", user.bearer()))
                .andExpect(status().isNoContent());

        String reissued = recordingEmailService.lastEmailVerificationToken(user.email());
        org.assertj.core.api.Assertions.assertThat(reissued).isNotBlank().isNotEqualTo(initial);

        // The original token must now be invalid (unused tokens are revoked on reissue).
        mockMvc.perform(post("/api/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("token", initial))))
                .andExpect(status().isBadRequest());
    }
}
