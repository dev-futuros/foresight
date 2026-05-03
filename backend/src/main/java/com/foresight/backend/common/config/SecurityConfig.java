package com.foresight.backend.common.config;

import java.util.List;

import jakarta.annotation.PostConstruct;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.foresight.backend.common.security.AiRateLimitFilter;
import com.foresight.backend.common.security.JwtAuthFilter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Main Spring Security configuration.
 *
 * <p>Authentication is delegated to Clerk: the frontend obtains a session JWT from Clerk and
 * sends it on every request; {@link JwtAuthFilter} validates it against Clerk's JWKS and
 * resolves the local {@link com.foresight.backend.user.User} row.
 *
 * <p>Public endpoints (no token required):
 *
 * <ul>
 *   <li>{@code POST /api/webhooks/clerk} — protected by Svix signature, not by JWT.
 *   <li>{@code /api/health}, {@code /actuator/health[/**]} — liveness probes.
 *   <li>Swagger UI / OpenAPI docs.
 * </ul>
 */
@Slf4j
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(SecurityProperties.class)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final AiRateLimitFilter aiRateLimitFilter;
    private final SecurityProperties properties;

    /**
     * Loud warning so it's impossible to miss in startup logs if auth is accidentally disabled in
     * an environment that isn't local development.
     */
    @PostConstruct
    void warnIfAuthDisabled() {
        if (properties.authDisabled()) {
            log.warn("");
            log.warn("==================================================================");
            log.warn("  AUTHENTICATION IS DISABLED (foresight.security.auth-disabled).");
            log.warn("  Every endpoint is public; a synthetic dev user is auto-injected.");
            log.warn("  This MUST only be used with the 'local' Spring profile.");
            log.warn("==================================================================");
            log.warn("");
        }
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
                    if (properties.authDisabled()) {
                        auth.anyRequest().permitAll();
                    } else {
                        auth.requestMatchers(HttpMethod.POST, "/api/webhooks/clerk")
                                .permitAll()
                                .requestMatchers(
                                        "/api/health",
                                        "/actuator/health",
                                        "/actuator/health/**",
                                        "/v3/api-docs/**",
                                        "/swagger-ui/**",
                                        "/swagger-ui.html")
                                .permitAll()
                                .anyRequest()
                                .authenticated();
                    }
                })
                // JWT auth populates the principal; the AI rate limiter consumes it.
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                // AI rate limit runs AFTER JWT auth so it can key by user id, not IP.
                .addFilterAfter(aiRateLimitFilter, JwtAuthFilter.class);

        return http.build();
    }

    @Bean
    public UrlBasedCorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        List<String> origins = properties.cors().allowedOrigins();
        System.out.println(">>> CORS allowed origins: " + origins); // ← add here
    
        config.setAllowedOriginPatterns(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
