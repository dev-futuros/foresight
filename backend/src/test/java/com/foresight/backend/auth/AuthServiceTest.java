package com.foresight.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.foresight.backend.auth.dto.AuthResponse;
import com.foresight.backend.auth.dto.LoginRequest;
import com.foresight.backend.auth.dto.RegisterRequest;
import com.foresight.backend.common.exception.ConflictException;
import com.foresight.backend.common.security.JwtService;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;
import com.foresight.backend.user.UserRole;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    private User persistedUser;

    @BeforeEach
    void setup() {
        persistedUser = User.builder()
                .email("user@example.com")
                .password("hashed-password")
                .name("User")
                .role(UserRole.USER)
                .language("es")
                .emailVerified(false)
                .build();
        persistedUser.setId(UUID.randomUUID());
    }

    @Test
    void registerHashesPasswordAndIssuesToken() {
        RegisterRequest request = new RegisterRequest("user@example.com", "plaintext-pass", "User", "en");

        when(userRepository.existsByEmail("user@example.com")).thenReturn(false);
        when(passwordEncoder.encode("plaintext-pass")).thenReturn("hashed-password");
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });
        when(jwtService.generateToken(any(UUID.class), eq("user@example.com"), eq("USER")))
                .thenReturn("jwt-token");
        when(jwtService.getTtlSeconds()).thenReturn(3600L);

        AuthResponse response = authService.register(request);

        assertThat(response.accessToken()).isEqualTo("jwt-token");
        assertThat(response.expiresIn()).isEqualTo(3600L);
        assertThat(response.user().email()).isEqualTo("user@example.com");

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getPassword()).isEqualTo("hashed-password");
        assertThat(saved.getRole()).isEqualTo(UserRole.USER);
        assertThat(saved.getLanguage()).isEqualTo("en");
        assertThat(saved.isEmailVerified()).isFalse();
    }

    @Test
    void registerDefaultsLanguageToSpanishWhenNull() {
        RegisterRequest request = new RegisterRequest("user@example.com", "plaintext-pass", "User", null);

        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(jwtService.generateToken(any(), any(), any())).thenReturn("t");

        authService.register(request);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertThat(captor.getValue().getLanguage()).isEqualTo("es");
    }

    @Test
    void registerRejectsDuplicateEmail() {
        RegisterRequest request = new RegisterRequest("user@example.com", "plaintext-pass", "User", "es");
        when(userRepository.existsByEmail("user@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Email already registered");

        verify(userRepository, never()).save(any());
    }

    @Test
    void loginReturnsTokenOnValidCredentials() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(persistedUser));
        when(passwordEncoder.matches("plaintext", "hashed-password")).thenReturn(true);
        when(jwtService.generateToken(persistedUser.getId(), "user@example.com", "USER"))
                .thenReturn("jwt-token");
        when(jwtService.getTtlSeconds()).thenReturn(3600L);

        AuthResponse response = authService.login(new LoginRequest("user@example.com", "plaintext"));

        assertThat(response.accessToken()).isEqualTo("jwt-token");
        assertThat(response.user().id()).isEqualTo(persistedUser.getId());
    }

    @Test
    void loginRejectsWrongPassword() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(persistedUser));
        when(passwordEncoder.matches("wrong", "hashed-password")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(new LoginRequest("user@example.com", "wrong")))
                .isInstanceOf(BadCredentialsException.class)
                .hasMessage("Invalid credentials");
    }

    @Test
    void loginRejectsUnknownEmailWithGenericMessage() {
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("ghost@example.com", "whatever")))
                .isInstanceOf(BadCredentialsException.class)
                .hasMessage("Invalid credentials");
    }
}
