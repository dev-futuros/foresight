package com.foresight.backend.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import com.foresight.backend.common.config.SecurityProperties;

import lombok.RequiredArgsConstructor;

/**
 * Builds the {@link JwtDecoder} used by {@link JwtAuthFilter} to validate Kinde session JWTs and
 * by the (forthcoming) {@code KindeWebhookController} to validate webhook payloads — Kinde signs
 * both with the same key set, so one decoder bean covers both.
 *
 * <p>The decoder fetches Kinde's public signing keys from the configured JWKS URI (cached and
 * rotated automatically by {@link NimbusJwtDecoder}) and applies two validators:
 *
 * <ul>
 *   <li>{@link org.springframework.security.oauth2.jwt.JwtTimestampValidator JwtTimestampValidator}
 *       — checks {@code exp} and {@code nbf} with a small clock skew.
 *   <li>An issuer validator pinned to the configured Kinde issuer URL — guarantees the token was
 *       minted by our Kinde tenant and not by a different one.
 * </ul>
 *
 * <p>Audience validation is intentionally not enforced here: Kinde session JWTs do not carry a
 * client-pinned {@code aud} claim by default, and pinning the issuer (combined with the
 * JWKS-fetched key) is already sufficient for the standard sign-in flow. Add an audience
 * validator only if you later register a Kinde API and want to gate the token on it.
 *
 * <p>Replaces {@code ClerkJwtDecoderConfig} as part of Phase 2 of the Kinde migration.
 */
@Configuration
@RequiredArgsConstructor
public class KindeJwtDecoderConfig {

    private final SecurityProperties securityProperties;

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(
                        securityProperties.kinde().jwksUri())
                .build();
        OAuth2TokenValidator<Jwt> validators =
                JwtValidators.createDefaultWithIssuer(securityProperties.kinde().issuer());
        decoder.setJwtValidator(validators);
        return decoder;
    }
}
