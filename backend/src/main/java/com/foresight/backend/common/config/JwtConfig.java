package com.foresight.backend.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.*;

@Configuration
public class JwtConfig {

    @Value("${foresight.security.clerk.issuer}")
    private String issuer;

    @Bean
    public JwtDecoder jwtDecoder() {

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json")
                .build();

        OAuth2TokenValidator<Jwt> validator = JwtValidators.createDefaultWithIssuer(issuer);

        decoder.setJwtValidator(validator);

        return decoder;
    }
}
