package com.foresight.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.foresight.backend.common.config.SecurityProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;

// The two literals below look like credentials to Sonar (S2068) but they are deliberate
// fixtures — only ever used to build SecurityProperties for unit tests, never persisted
// or shipped. Suppressing the rule at class scope keeps the intent explicit.
@SuppressWarnings("java:S2068")
class JwtServiceTest {

    private static final String SECRET = "this-is-a-test-secret-that-is-long-enough-32b+";

    private JwtService jwtService(Duration ttl) {
        return new JwtService(propsWithSecret(SECRET, ttl));
    }

    private static SecurityProperties propsWithSecret(String secret, Duration ttl) {
        return new SecurityProperties(
                false,
                new SecurityProperties.Jwt(secret, ttl),
                new SecurityProperties.Cors(List.of()),
                Duration.ofMinutes(30),
                Duration.ofHours(24),
                new SecurityProperties.RateLimit(
                        new SecurityProperties.RateLimit.Bucket(10, 10, Duration.ofMinutes(1)),
                        new SecurityProperties.RateLimit.Bucket(30, 30, Duration.ofHours(1))));
    }

    @Test
    void generatesAndParsesValidToken() {
        JwtService service = jwtService(Duration.ofHours(1));
        UUID userId = UUID.randomUUID();

        String token = service.generateToken(userId, "user@example.com", "USER");
        Claims claims = service.parse(token);

        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims).containsEntry("email", "user@example.com").containsEntry("role", "USER");
        assertThat(claims.getExpiration()).isAfter(claims.getIssuedAt());
    }

    @Test
    void ttlSecondsMatchesConfiguration() {
        assertThat(jwtService(Duration.ofHours(2)).getTtlSeconds()).isEqualTo(7200);
    }

    @Test
    void rejectsTamperedToken() {
        JwtService service = jwtService(Duration.ofHours(1));
        String token = service.generateToken(UUID.randomUUID(), "user@example.com", "USER");
        String tampered = token.substring(0, token.length() - 2) + "AA";

        assertThatThrownBy(() -> service.parse(tampered)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsExpiredToken() {
        // Negative TTL → token is born already expired. Deterministic and avoids Thread.sleep
        // (which would make the test race-prone, hence Sonar's S2925).
        JwtService service = jwtService(Duration.ofSeconds(-1));
        String token = service.generateToken(UUID.randomUUID(), "user@example.com", "USER");

        assertThatThrownBy(() -> service.parse(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsTokenSignedWithDifferentSecret() {
        JwtService signer = jwtService(Duration.ofHours(1));
        String token = signer.generateToken(UUID.randomUUID(), "user@example.com", "USER");

        SecurityProperties otherProps = new SecurityProperties(
                false,
                new SecurityProperties.Jwt("another-very-long-secret-that-is-also-32b++", Duration.ofHours(1)),
                new SecurityProperties.Cors(List.of()),
                Duration.ofMinutes(30),
                Duration.ofHours(24),
                new SecurityProperties.RateLimit(
                        new SecurityProperties.RateLimit.Bucket(10, 10, Duration.ofMinutes(1)),
                        new SecurityProperties.RateLimit.Bucket(30, 30, Duration.ofHours(1))));
        JwtService verifier = new JwtService(otherProps);

        assertThatThrownBy(() -> verifier.parse(token)).isInstanceOf(JwtException.class);
    }
}
