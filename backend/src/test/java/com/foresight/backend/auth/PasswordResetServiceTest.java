package com.foresight.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

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
import com.foresight.backend.user.UserRole;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordResetTokenRepository tokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private EmailService emailService;

    private PasswordResetService service;
    private User user;

    @BeforeEach
    void setup() {
        user = User.builder()
                .email("user@example.com")
                .password("hashed-old")
                .name("User")
                .role(UserRole.USER)
                .language("es")
                .emailVerified(true)
                .build();
        user.setId(UUID.randomUUID());
        service = new PasswordResetService(
                userRepository,
                tokenRepository,
                passwordEncoder,
                emailService,
                new SecurityProperties(
                        false,
                        new SecurityProperties.Jwt("test-secret-at-least-32-chars-long!!", Duration.ofHours(1)),
                        new SecurityProperties.Cors(List.of()),
                        Duration.ofMinutes(30),
                        Duration.ofHours(24),
                        new SecurityProperties.RateLimit(
                                new SecurityProperties.RateLimit.Bucket(10, 10, Duration.ofMinutes(1)),
                                new SecurityProperties.RateLimit.Bucket(30, 30, Duration.ofHours(1)))));
    }

    @Test
    void initiateIssuesTokenAndEmailForKnownUser() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));

        service.initiatePasswordReset(new ForgotPasswordRequest("user@example.com"));

        verify(tokenRepository).invalidateUnusedForUser(user.getId());

        ArgumentCaptor<PasswordResetToken> tokenCaptor = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        PasswordResetToken saved = tokenCaptor.getValue();
        assertThat(saved.getUserId()).isEqualTo(user.getId());
        assertThat(saved.getTokenHash()).hasSize(64);
        assertThat(saved.getUsedAt()).isNull();
        assertThat(saved.getExpiresAt()).isAfter(Instant.now());

        ArgumentCaptor<String> rawTokenCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailService).sendPasswordResetEmail(eq("user@example.com"), rawTokenCaptor.capture());
        assertThat(TokenHasher.hash(rawTokenCaptor.getValue())).isEqualTo(saved.getTokenHash());
    }

    @Test
    void initiateIsSilentForUnknownEmail() {
        // Silent no-op: the endpoint must be indistinguishable from the happy path so callers
        // cannot probe which addresses are registered.
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        service.initiatePasswordReset(new ForgotPasswordRequest("ghost@example.com"));

        verifyNoInteractions(tokenRepository);
        verifyNoInteractions(emailService);
    }

    @Test
    void completeRotatesPasswordAndMarksTokenUsed() {
        String rawToken = "valid-reset-token";
        PasswordResetToken token = PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwordEncoder.encode("NewPassw0rd!")).thenReturn("hashed-new");

        service.completePasswordReset(new ResetPasswordRequest(rawToken, "NewPassw0rd!"));

        assertThat(user.getPassword()).isEqualTo("hashed-new");
        assertThat(token.getUsedAt()).isNotNull();
        verify(userRepository).save(user);
        verify(tokenRepository).save(token);
    }

    @Test
    void completeRejectsUnknownToken() {
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.completePasswordReset(new ResetPasswordRequest("nope", "NewPassw0rd!")));

        assertThat(thrown).isInstanceOf(BadRequestException.class).hasMessageContaining("Invalid or expired token");

        verify(passwordEncoder, never()).encode(anyString());
        verify(userRepository, never()).save(any());
    }

    @Test
    void completeRejectsUsedToken() {
        String rawToken = "used-token";
        PasswordResetToken token = PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .usedAt(Instant.now().minusSeconds(10))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.completePasswordReset(new ResetPasswordRequest(rawToken, "NewPassw0rd!")));

        assertThat(thrown).isInstanceOf(BadRequestException.class);

        verifyNoMoreInteractions(userRepository);
        verify(passwordEncoder, never()).encode(anyString());
    }

    @Test
    void completeRejectsExpiredToken() {
        String rawToken = "expired-token";
        PasswordResetToken token = PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().minusSeconds(60))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.completePasswordReset(new ResetPasswordRequest(rawToken, "NewPassw0rd!")));

        assertThat(thrown).isInstanceOf(BadRequestException.class);

        verifyNoMoreInteractions(userRepository);
    }

    @Test
    void completeRejectsTokenForMissingUser() {
        String rawToken = "orphan-token";
        PasswordResetToken token = PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));
        when(userRepository.findById(user.getId())).thenReturn(Optional.empty());

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.completePasswordReset(new ResetPasswordRequest(rawToken, "NewPassw0rd!")));

        assertThat(thrown).isInstanceOf(BadRequestException.class);

        verify(passwordEncoder, never()).encode(anyString());
    }
}
