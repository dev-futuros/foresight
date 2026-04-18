package com.foresight.backend.common.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Service;

import com.foresight.backend.common.config.SecurityProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Issues and verifies JWT access tokens.
 *
 * <p>Uses HMAC-SHA (HS256 or stronger depending on the secret length). The signing key is
 * derived from {@code foresight.security.jwt.secret} and must be at least 32 bytes.
 *
 * <p>Tokens carry:
 * <ul>
 *   <li>{@code sub}: the user's UUID (as String)</li>
 *   <li>{@code email}: the user's email (convenience claim)</li>
 *   <li>{@code role}: the user's role</li>
 *   <li>{@code iat} / {@code exp}: issued-at and expiration timestamps</li>
 * </ul>
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlSeconds;

    /**
     * @param properties typed security configuration providing secret and TTL
     */
    public JwtService(SecurityProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.jwt().secret().getBytes(StandardCharsets.UTF_8));
        this.ttlSeconds = properties.jwt().accessTokenTtl().getSeconds();
    }

    /**
     * Builds a signed JWT for the given user.
     *
     * @param userId the user's UUID (becomes {@code sub})
     * @param email  the user's email (claim)
     * @param role   the user's role (claim)
     * @return a compact serialised JWT
     */
    public String generateToken(UUID userId, String email, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("email", email)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key)
                .compact();
    }

    /**
     * Verifies the token signature + expiration and returns its claims.
     *
     * @param token compact JWT string
     * @return parsed claims
     * @throws io.jsonwebtoken.JwtException if the token is invalid, expired or tampered with
     */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    /**
     * @return configured access-token lifetime in seconds (exposed so {@code /auth/login} can
     *         return {@code expiresIn} to the client)
     */
    public long getTtlSeconds() {
        return ttlSeconds;
    }
}
