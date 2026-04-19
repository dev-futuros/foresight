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
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.foresight.backend.common.security.JwtAuthFilter;
import com.foresight.backend.common.security.RateLimitFilter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Main Spring Security configuration.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Enable CORS for the configured frontend origins.</li>
 *   <li>Disable CSRF (we are stateless and use JWTs, not cookies with session IDs).</li>
 *   <li>Force stateless sessions so no HTTP session is ever created.</li>
 *   <li>Declare which endpoints are public vs. authenticated.</li>
 *   <li>Insert {@link JwtAuthFilter} before the username/password filter so JWT-based
 *       authentication takes precedence.</li>
 * </ul>
 *
 * <p>Public auth endpoints (no token required): {@code /api/auth/register},
 * {@code /api/auth/login}, {@code /api/auth/forgot-password}, {@code /api/auth/reset-password},
 * {@code /api/auth/verify-email}. Other {@code /api/auth/*} routes (change-password,
 * resend-verification-email) still require a valid JWT.
 *
 * <p>Other public endpoints: {@code /api/health}, {@code /actuator/health}, and the Swagger
 * UI / OpenAPI docs. Everything else requires a valid JWT.
 */
@Slf4j
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(SecurityProperties.class)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RateLimitFilter rateLimitFilter;
    private final SecurityProperties properties;

    /**
     * Loud warning so it's impossible to miss in startup logs if auth is accidentally disabled
     * in an environment that isn't local development.
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

    /**
     * Builds the main {@link SecurityFilterChain}.
     *
     * <p>When {@link SecurityProperties#authDisabled()} is {@code true}, every endpoint is made
     * public — but the {@link JwtAuthFilter} still runs and injects the synthetic dev principal
     * so {@code @CurrentUser}-bound controllers keep working.
     *
     * @param http security DSL provided by Spring
     * @return the configured filter chain
     * @throws Exception if the DSL fails to build (propagated by Spring)
     */
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
                        auth.requestMatchers(
                                        HttpMethod.POST,
                                        "/api/auth/register",
                                        "/api/auth/login",
                                        "/api/auth/forgot-password",
                                        "/api/auth/reset-password",
                                        "/api/auth/verify-email")
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
                // Rate limit FIRST so brute-force traffic never reaches JWT parsing / the DB.
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * CORS configuration bound to the list of origins declared in
     * {@code foresight.security.cors.allowed-origins}.
     *
     * @return a source used by Spring Security's CORS filter
     */
    @Bean
    public UrlBasedCorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(properties.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /**
     * Password encoder used to hash and verify user passwords.
     *
     * @return a BCrypt encoder (default cost factor 10)
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Exposes the {@link AuthenticationManager} as a bean so it can be injected where needed.
     *
     * @param config Spring-provided auth configuration
     * @return the underlying authentication manager
     * @throws Exception if the manager cannot be obtained
     */
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
