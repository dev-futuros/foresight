package com.foresight.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.foresight.backend.common.config.SecurityProperties;

class JwtAuthFilterTest {

    private static final String SECRET = "this-is-a-test-secret-that-is-long-enough-32b+";

    private final JwtService realJwtService = new JwtService(testProperties(false));

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private JwtAuthFilter filter(boolean authDisabled) {
        return new JwtAuthFilter(realJwtService, testProperties(authDisabled));
    }

    /**
     * Builds a {@link SecurityProperties} populated with harmless defaults — these tests
     * only exercise the JWT + auth-disabled switch, so the password-reset / email-verify
     * TTLs and rate-limit bucket are unused at runtime but must be non-null for the record.
     */
    private static SecurityProperties testProperties(boolean authDisabled) {
        return new SecurityProperties(
                authDisabled,
                new SecurityProperties.Jwt(SECRET, Duration.ofHours(1)),
                new SecurityProperties.Cors(List.of()),
                Duration.ofMinutes(30),
                Duration.ofHours(24),
                new SecurityProperties.RateLimit(new SecurityProperties.RateLimit.Bucket(10, 10, Duration.ofMinutes(1))));
    }

    @Test
    void validBearerTokenPopulatesPrincipal() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = realJwtService.generateToken(userId, "user@example.com", "USER");

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer " + token);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(false).doFilter(req, res, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isInstanceOf(AuthenticatedUser.class);
        AuthenticatedUser principal = (AuthenticatedUser) auth.getPrincipal();
        assertThat(principal.id()).isEqualTo(userId);
        verify(chain).doFilter(req, res);
    }

    @Test
    void duplicatedBearerPrefixIsTolerated() throws Exception {
        // Common Swagger paste mistake: "Bearer Bearer eyJ..."
        UUID userId = UUID.randomUUID();
        String token = realJwtService.generateToken(userId, "user@example.com", "USER");

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer Bearer " + token);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(false).doFilter(req, res, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(((AuthenticatedUser) auth.getPrincipal()).id()).isEqualTo(userId);
    }

    @Test
    void invalidTokenLeavesContextEmptyAndContinuesChain() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer not-a-real-jwt");
        when(req.getMethod()).thenReturn("GET");
        when(req.getRequestURI()).thenReturn("/api/reports");
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(false).doFilter(req, res, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(req, res);
    }

    @Test
    void missingHeaderLeavesContextEmpty() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn(null);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(false).doFilter(req, res, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void devModeInjectsDevPrincipalWhenNoToken() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn(null);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(true).doFilter(req, res, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(((AuthenticatedUser) auth.getPrincipal()).id()).isEqualTo(DevPrincipal.ID);
        assertThat(((AuthenticatedUser) auth.getPrincipal()).email()).isEqualTo(DevPrincipal.EMAIL);
    }

    @Test
    void devModeStillPrefersValidToken() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = realJwtService.generateToken(userId, "real@example.com", "USER");

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer " + token);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(true).doFilter(req, res, chain);

        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        assertThat(principal.id()).isEqualTo(userId);
        assertThat(principal.id()).isNotEqualTo(DevPrincipal.ID);
    }

    @Test
    void devModeFallsBackToDevPrincipalWhenTokenIsInvalid() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer garbage-token");
        when(req.getMethod()).thenReturn("POST");
        when(req.getRequestURI()).thenReturn("/api/reports");
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter(true).doFilter(req, res, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(((AuthenticatedUser) auth.getPrincipal()).id()).isEqualTo(DevPrincipal.ID);
    }

    @Test
    void doesNotConsultJwtServiceWhenAuthDisabledAndNoHeader() throws Exception {
        JwtService mockJwt = mock(JwtService.class);
        JwtAuthFilter f = new JwtAuthFilter(mockJwt, testProperties(true));

        HttpServletRequest req = mock(HttpServletRequest.class);
        HttpServletResponse res = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        f.doFilter(req, res, chain);

        verify(mockJwt, never()).parse(org.mockito.ArgumentMatchers.anyString());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }
}
