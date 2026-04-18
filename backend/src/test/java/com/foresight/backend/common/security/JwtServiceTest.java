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

class JwtServiceTest {

    private static final String SECRET = "this-is-a-test-secret-that-is-long-enough-32b+";

    private JwtService jwtService(Duration ttl) {
        SecurityProperties props =
                new SecurityProperties(new SecurityProperties.Jwt(SECRET, ttl), new SecurityProperties.Cors(List.of()));
        return new JwtService(props);
    }

    @Test
    void generatesAndParsesValidToken() {
        JwtService service = jwtService(Duration.ofHours(1));
        UUID userId = UUID.randomUUID();

        String token = service.generateToken(userId, "user@example.com", "USER");
        Claims claims = service.parse(token);

        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.get("email")).isEqualTo("user@example.com");
        assertThat(claims.get("role")).isEqualTo("USER");
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
    void rejectsExpiredToken() throws InterruptedException {
        JwtService service = jwtService(Duration.ofMillis(1));
        String token = service.generateToken(UUID.randomUUID(), "user@example.com", "USER");

        Thread.sleep(50);

        assertThatThrownBy(() -> service.parse(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsTokenSignedWithDifferentSecret() {
        JwtService signer = jwtService(Duration.ofHours(1));
        String token = signer.generateToken(UUID.randomUUID(), "user@example.com", "USER");

        SecurityProperties otherProps = new SecurityProperties(
                new SecurityProperties.Jwt("another-very-long-secret-that-is-also-32b++", Duration.ofHours(1)),
                new SecurityProperties.Cors(List.of()));
        JwtService verifier = new JwtService(otherProps);

        assertThatThrownBy(() -> verifier.parse(token)).isInstanceOf(JwtException.class);
    }
}
