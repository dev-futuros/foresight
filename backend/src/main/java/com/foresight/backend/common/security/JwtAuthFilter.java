package com.foresight.backend.common.security;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.foresight.backend.common.config.SecurityProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Servlet filter that extracts a JWT from the {@code Authorization: Bearer <token>} header,
 * validates it, and populates the Spring {@link SecurityContextHolder} with an
 * {@link AuthenticatedUser} principal.
 *
 * <p>Runs once per request (via {@link OncePerRequestFilter}) and is inserted before
 * {@link org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter}
 * in {@link com.foresight.backend.common.config.SecurityConfig}.
 *
 * <p>If the token is missing, malformed, or invalid, the failure is logged at DEBUG level
 * (so the user can diagnose without spamming prod logs) and the security context is left
 * empty — downstream authorization rules then reject the request with 401.
 *
 * <p>When {@link SecurityProperties#authDisabled()} is {@code true} (local dev only), a
 * synthetic {@link DevPrincipal} is injected if no valid token was provided.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final SecurityProperties securityProperties;

    /**
     * Per-request filter logic.
     *
     * @param request     the incoming HTTP request
     * @param response    the outgoing HTTP response
     * @param filterChain the remaining filter chain
     * @throws ServletException if a downstream filter fails
     * @throws IOException      if I/O fails while reading/writing the request or response
     */
    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader(HEADER);
        if (header != null
                && header.startsWith(PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            String token = header.substring(PREFIX.length()).trim();

            // Common Swagger paste mistake: pasting "Bearer eyJ..." into a dialog that already
            // prepends "Bearer " yields "Bearer Bearer eyJ...". Strip the duplicate prefix
            // so the token still validates.
            if (token.startsWith(PREFIX)) {
                log.debug("Stripped duplicated 'Bearer ' prefix from Authorization header");
                token = token.substring(PREFIX.length()).trim();
            }

            try {
                Claims claims = jwtService.parse(token);
                UUID userId = UUID.fromString(claims.getSubject());
                String email = claims.get("email", String.class);
                String role = claims.get("role", String.class);
                authenticate(userId, email, role);
            } catch (JwtException | IllegalArgumentException ex) {
                // Diagnostic logging at DEBUG so it's visible during dev (LOG_LEVEL=DEBUG for
                // com.foresight) but doesn't pollute prod logs.
                log.debug(
                        "JWT validation failed for {} {}: {}",
                        request.getMethod(),
                        request.getRequestURI(),
                        ex.getMessage());
            }
        }

        // Local-dev fallback: when auth is disabled and no valid principal is present,
        // inject the synthetic dev user so @CurrentUser-bound controllers keep working.
        if (securityProperties.authDisabled()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            authenticate(DevPrincipal.ID, DevPrincipal.EMAIL, DevPrincipal.ROLE);
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Builds and stores the Spring authentication token for the given identity.
     *
     * @param userId user UUID
     * @param email  user email (claim or dev default)
     * @param role   user role (claim or dev default)
     */
    private void authenticate(UUID userId, String email, String role) {
        AuthenticatedUser principal = new AuthenticatedUser(userId, email, role);
        var authority = new SimpleGrantedAuthority("ROLE_" + role);
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
