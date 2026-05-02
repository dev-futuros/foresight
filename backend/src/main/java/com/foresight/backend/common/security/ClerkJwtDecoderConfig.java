package com.foresight.backend.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import com.foresight.backend.common.config.SecurityProperties;

import lombok.RequiredArgsConstructor;

/**
 * Builds the {@link JwtDecoder} used by {@link JwtAuthFilter} to validate Clerk session JWTs.
 *
 * <p>The decoder fetches Clerk's public signing keys from the configured JWKS URI (cached and
 * rotated automatically by {@link NimbusJwtDecoder}) and applies two validators:
 *
 * <ul>
 *   <li>{@link JwtTimestampValidator} — checks {@code exp} and {@code nbf} with a small clock skew.
 *   <li>An issuer validator pinned to the configured Clerk issuer URL — guarantees the token was
 *       minted by our Clerk instance and not by a different tenant.
 * </ul>
 *
 * <p>Audience validation is intentionally not enforced: by default Clerk session JWTs do not carry
 * an {@code aud} claim, and pinning the issuer (combined with the JWKS-fetched key) is already
 * sufficient. If a JWT template is later configured with a custom {@code aud}, add a validator
 * here.
 */
@Configuration
@RequiredArgsConstructor
public class ClerkJwtDecoderConfig {

    private final SecurityProperties securityProperties;

    @Bean
    public JwtDecoder clerkJwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(
                        securityProperties.clerk().jwksUri())
                .build();
        OAuth2TokenValidator<Jwt> validators =
                JwtValidators.createDefaultWithIssuer(securityProperties.clerk().issuer());
        decoder.setJwtValidator(validators);
        return decoder;
    }
}
