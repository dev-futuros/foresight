package com.foresight.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.foresight.backend.auth.token.EmailVerificationToken;
import com.foresight.backend.auth.token.EmailVerificationTokenRepository;
import com.foresight.backend.auth.token.TokenHasher;
import com.foresight.backend.common.config.SecurityProperties;
import com.foresight.backend.common.email.EmailService;
import com.foresight.backend.common.exception.BadRequestException;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;
import com.foresight.backend.user.UserRole;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private EmailVerificationTokenRepository tokenRepository;

    @Mock
    private EmailService emailService;

    @InjectMocks
    private EmailVerificationService service;

    private User user;

    @BeforeEach
    void setup() {
        user = User.builder()
                .email("user@example.com")
                .password("hashed")
                .name("User")
                .role(UserRole.USER)
                .language("es")
                .emailVerified(false)
                .build();
        user.setId(UUID.randomUUID());
        // Inject SecurityProperties manually — @InjectMocks can't build a record from mocks.
        service = new EmailVerificationService(
                userRepository,
                tokenRepository,
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
    void sendVerificationEmailIssuesTokenAndDispatchesEmail() {
        service.sendVerificationEmail(user);

        verify(tokenRepository).invalidateUnusedForUser(user.getId());

        ArgumentCaptor<EmailVerificationToken> tokenCaptor = ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        EmailVerificationToken saved = tokenCaptor.getValue();
        assertThat(saved.getUserId()).isEqualTo(user.getId());
        assertThat(saved.getTokenHash()).hasSize(64).matches("[0-9a-f]+");
        assertThat(saved.getUsedAt()).isNull();
        assertThat(saved.getExpiresAt()).isAfter(Instant.now());

        ArgumentCaptor<String> rawTokenCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailService).sendEmailVerificationEmail(eq("user@example.com"), rawTokenCaptor.capture());
        // The hash on disk must correspond to the raw token we dispatched — otherwise
        // verification would never succeed.
        assertThat(TokenHasher.hash(rawTokenCaptor.getValue())).isEqualTo(saved.getTokenHash());
    }

    @Test
    void sendVerificationEmailIsNoOpWhenAlreadyVerified() {
        user.setEmailVerified(true);

        service.sendVerificationEmail(user);

        verifyNoInteractions(tokenRepository);
        verifyNoInteractions(emailService);
    }

    @Test
    void resendForUserLooksUpUserAndReissues() {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

        service.resendForUser(user.getId());

        verify(tokenRepository).invalidateUnusedForUser(user.getId());
        verify(tokenRepository).save(any(EmailVerificationToken.class));
        verify(emailService).sendEmailVerificationEmail(eq("user@example.com"), anyString());
    }

    @Test
    void resendForUserThrowsWhenUserMissing() {
        UUID ghost = UUID.randomUUID();
        when(userRepository.findById(ghost)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resendForUser(ghost))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("User not found");

        verifyNoInteractions(emailService);
    }

    @Test
    void verifyFlipsEmailVerifiedAndMarksTokenUsed() {
        String rawToken = "raw-token-value";
        EmailVerificationToken token = EmailVerificationToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

        service.verify(rawToken);

        assertThat(user.isEmailVerified()).isTrue();
        assertThat(token.getUsedAt()).isNotNull();
        verify(userRepository).save(user);
        verify(tokenRepository).save(token);
    }

    @Test
    void verifyRejectsUnknownToken() {
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.verify("nope"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Invalid or expired token");

        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyRejectsAlreadyUsedToken() {
        String rawToken = "used-token";
        EmailVerificationToken token = EmailVerificationToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .usedAt(Instant.now().minusSeconds(60))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.verify(rawToken))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Invalid or expired token");

        verifyNoMoreInteractions(userRepository);
    }

    @Test
    void verifyRejectsExpiredToken() {
        String rawToken = "expired-token";
        EmailVerificationToken token = EmailVerificationToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().minusSeconds(60))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.verify(rawToken)).isInstanceOf(BadRequestException.class);

        verifyNoMoreInteractions(userRepository);
    }

    @Test
    void verifyRejectsTokenPointingToMissingUser() {
        String rawToken = "orphan-token";
        EmailVerificationToken token = EmailVerificationToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHasher.hash(rawToken))
                .expiresAt(Instant.now().plusSeconds(600))
                .build();

        when(tokenRepository.findByTokenHash(TokenHasher.hash(rawToken))).thenReturn(Optional.of(token));
        when(userRepository.findById(user.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.verify(rawToken)).isInstanceOf(BadRequestException.class);
    }
}
